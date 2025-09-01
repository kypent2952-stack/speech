// 캐시할 파일 목록을 정의합니다.
const CACHE_NAME = 'sovt-therapy-cache-v1';
const urlsToCache = [
  './',
  './sovt_therapy_app.html',
  './manifest.json',
  './icon-192x192.png',
  './icon-512x512.png'
];

// 1. 서비스 워커 설치
self.addEventListener('install', (event) => {
  // 설치 과정에서 위에 정의한 파일들을 캐시에 저장합니다.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache opened');
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. 네트워크 요청 가로채기 (Fetch)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    // 먼저 캐시에서 요청과 일치하는 것을 찾습니다.
    caches.match(event.request)
      .then((response) => {
        // 캐시에 응답이 있으면 그것을 반환하고, 없으면 네트워크로 요청을 보냅니다.
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

