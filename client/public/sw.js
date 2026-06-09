/**
 * ============================================================================
 * Service Worker — 离线缓存和二次访问加速
 * ============================================================================
 *
 * 功能：
 *   1. 缓存所有静态资源（JS、CSS、字体等）
 *   2. 离线访问支持
 *   3. 二次访问从缓存加载，实现秒开
 *   4. HTML 文件网络优先，确保获取最新版本
 * ============================================================================
 */

const CACHE_NAME = 'langrensha-v2';

// 需要缓存的资源类型
const CACHEABLE_EXTENSIONS = [
  '.js',
  '.css',
  '.woff',
  '.woff2',
  '.ttf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
];

// 安装事件 — 预缓存关键资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] 缓存已打开');
      // 不预缓存具体文件，让首次访问时自动缓存
      return self.skipWaiting();
    })
  );
});

// 激活事件 — 清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] 删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// 请求拦截 — 缓存优先策略
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 仅处理 GET 请求
  if (request.method !== 'GET') {
    return;
  }

  // 跳过 WebSocket 和 API 请求
  if (url.protocol === 'ws:' || url.protocol === 'wss:' || url.pathname.startsWith('/api')) {
    return;
  }

  // HTML 文件 — 网络优先策略
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // 缓存最新的 HTML
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // 网络失败时，返回缓存的 HTML
          return caches.match(request);
        })
    );
    return;
  }

  // 静态资源 — 缓存优先策略
  const ext = url.pathname.substring(url.pathname.lastIndexOf('.'));
  if (CACHEABLE_EXTENSIONS.includes(ext) || url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          fetch(request).then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, networkResponse);
              });
            }
          }).catch(() => {});
          // 返回缓存
          return cachedResponse;
        }

        // 缓存未命中，从网络获取并缓存
        return fetch(request).then((response) => {
          // 仅缓存成功的响应
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // 其他请求 — 网络优先，失败时尝试缓存
  event.respondWith(
    fetch(request).catch(() => {
      return caches.match(request);
    })
  );
});
