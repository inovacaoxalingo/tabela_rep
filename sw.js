/* Tabela de Preços Xalingo — funciona sem internet.
   - a página: busca na internet primeiro; sem sinal, usa a cópia guardada
   - geradores de Excel/PDF, fontes e fotos: usa a cópia guardada
   - a planilha (Google) não passa por aqui: o app guarda os dados sozinho */
const VERSAO = 'd27ac666';
const CACHE = 'xal-rep-' + VERSAO;
const CACHE_FIXO = 'xal-rep-recursos';
const CACHE_FOTOS = 'xal-rep-fotos';
const BASE = new URL('./', self.location).pathname;
const ESSENCIAIS = ['./', './index.html', './manifest.json', './icon.png'];
const CDNS = ['cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CACHE).then(c => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith('xal-rep-') && ![CACHE, CACHE_FIXO, CACHE_FOTOS].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function redePrimeiro(req) {
  const c = await caches.open(CACHE);
  const nav = req.mode === 'navigate';
  const guardado = nav ? (await c.match('./index.html')) || (await c.match('./'))
                       : await c.match(req, { ignoreSearch: true });
  const rede = (async () => {
    const resp = nav ? await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : await fetch(req);
    if (resp && resp.ok && !resp.redirected) {
      const cp = resp.clone();
      if (nav) { await c.put('./index.html', cp); await c.put('./', resp.clone()); }
      else await c.put(req, cp);
      return resp;
    }
    if (guardado) return guardado;           // 404/500 ou página de erro: usa a cópia guardada
    return resp;
  })();
  if (!guardado) return rede.catch(() => Response.error());
  // sinal fraco: espera no máximo 4 s pela internet, depois abre a cópia guardada
  const espera = new Promise(ok => setTimeout(() => ok(guardado), 4000));
  return Promise.race([rede.catch(() => guardado), espera]);
}
async function guardadoPrimeiro(req, nome) {
  const c = await caches.open(nome);
  const achou = await c.match(req);
  if (achou) return achou;
  const resp = await fetch(req);
  if (resp && (resp.ok || resp.type === 'opaque')) c.put(req, resp.clone());
  return resp;
}

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (!url.pathname.startsWith(BASE)) return;                 // outras páginas do site (catálogo)
    if (url.pathname.endsWith('/sw.js')) return;
    ev.respondWith(redePrimeiro(req));
    return;
  }
  if (CDNS.includes(url.hostname)) { ev.respondWith(guardadoPrimeiro(req, CACHE_FIXO)); return; }
  if (req.destination === 'image' && /wp-content\/uploads/.test(url.pathname)) {
    ev.respondWith(guardadoPrimeiro(req, CACHE_FOTOS).catch(() => Response.error()));
  }
});
