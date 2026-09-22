/* Gestão Rápida · Programação Campo — service worker
   Cache-first nos arquivos do app. Mudar CACHE força a atualização. */
const CACHE = 'gestao-rapida-programacao-v20';

const ARQUIVOS = [
  './', './index.html', './manifest.json',
  './css/app.css', './css/programacao.css',
  './js/config.js', './js/base.js', './js/comum.js', './js/acesso.js',
  './js/painel.js', './js/atividades.js', './js/reuniao.js',
  './js/relatorio.js', './js/cadastros.js', './js/pessoas.js', './js/ficha.js', './js/diario.js',
  './icons/gr-pc-192.v1.png', './icons/gr-pc-512.v1.png', './icons/gr-pc-180.v1.png', './icons/favicon-gr-pc.v1.ico',
  './img/sakuma-logo.png', './img/sakuma-marca-vertical.png', './img/lop-marca.png',
  './img/lop-assinatura-laser-claro.png', './img/lop-assinatura-laser-escuro.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CACHE).then(c =>
    Promise.all(ARQUIVOS.map(a => c.add(a).catch(e => console.warn('sem cache:', a, e))))
  ).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys()
    .then(n => Promise.all(n.filter(x => x !== CACHE).map(x => caches.delete(x))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', ev => {
  const url = new URL(ev.request.url);
  if (url.hostname.endsWith('.supabase.co')) return;
  if (ev.request.method !== 'GET') return;
  ev.respondWith(caches.match(ev.request).then(r => r || fetch(ev.request).then(resp => {
    if (resp && resp.status === 200 && (url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net')) {
      const copia = resp.clone();
      caches.open(CACHE).then(c => c.put(ev.request, copia));
    }
    return resp;
  }).catch(() => caches.match('./index.html'))));
});
