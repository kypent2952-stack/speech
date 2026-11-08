// SOVT 음성치료 PWA 서비스 워커
// 캐시 버전: 앱 파일(index.html 등)을 바꿀 때마다 숫자를 올려야 사용자 기기에 새 버전이 반영됩니다.
const CACHE_VERSION = 'v2-2026-11-08';
const APP_CACHE = `sovt-app-${CACHE_VERSION}`;
const RUNTIME_CACHE = `sovt-runtime-${CACHE_VERSION}`;

// 앱 실행에 꼭 필요한 로컬 파일 (실제 저장소 파일과 일치해야 함)
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192x192.png',
  './icon-512x512.png',
  './icon-maskable-192x192.png',
  './icon-maskable-512x512.png',
  './apple-touch-icon.png'
];

// 오프라인에서도 쓰고 싶은 외부 리소스 (실패해도 설치는 계속됨)
const OPTIONAL_REMOTE = [
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    // 로컬 파일은 하나씩 넣어서, 한 파일이 실패해도 나머지는 캐시되도록 함
    await Promise.all(APP_SHELL.map((url) =>
      cache.add(new Request(url, { cache: 'reload' })).catch((err) => console.warn('[sw] precache 실패', url, err))
    ));
    const rt = await caches.open(RUNTIME_CACHE);
    await Promise.all(OPTIONAL_REMOTE.map((url) =>
      fetch(url, { mode: 'cors' }).then((res) => { if (res.ok) return rt.put(url, res); }).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => (k.startsWith('sovt-') && k !== APP_CACHE && k !== RUNTIME_CACHE) || k === 'sovt-therapy-cache-v1')
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1) 페이지 이동: 네트워크 우선 → 실패 시 캐시된 index.html (오프라인 지원)
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok && url.origin === self.location.origin) {
          const cache = await caches.open(APP_CACHE);
          cache.put('./index.html', fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch (e) {
        return (await caches.match('./index.html')) || (await caches.match('./')) ||
          new Response('<!doctype html><meta charset="utf-8"><title>오프라인</title><p style="font-family:sans-serif;padding:24px">오프라인 상태입니다. 인터넷에 연결한 뒤 다시 열어 주세요.</p>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // 2) 같은 출처의 정적 파일: 캐시 우선, 없으면 네트워크 후 저장
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      } catch (e) {
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })());
    return;
  }

  // 3) 외부 CDN(폰트 등): 캐시 먼저 보여주고 백그라운드로 갱신(stale-while-revalidate).
  //    네트워크·CDN이 실패해도 빈 응답을 돌려줘 페이지가 멈추지 않음 → 시스템 폰트로 대체 표시.
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
        return res;
      }).catch(() => null);
      if (cached) { event.waitUntil(network); return cached; }
      const res = await network;
      return res || new Response('', { status: 504, statusText: 'Offline' });
    })());
  }
  // 그 밖의 외부 요청은 서비스 워커가 관여하지 않음
});
