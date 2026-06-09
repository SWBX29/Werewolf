import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// ============================================================================
// Service Worker 注册 — 离线缓存和二次访问加速
// ============================================================================

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[SW] Service Worker 注册成功:', registration.scope);
      })
      .catch((error) => {
        console.warn('[SW] Service Worker 注册失败:', error);
      });
  });
}
