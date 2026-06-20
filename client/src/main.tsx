/**
 * ============================================================================
 * main — 应用启动入口
 * ============================================================================
 *
 * 架构说明：
 *   1. 挂载 React 根组件到 DOM
 *   2. 注册 Service Worker 实现离线缓存和二次访问加速
 *
 * 设计原则：
 *   - 使用 StrictMode 进行开发阶段额外检查
 *   - Service Worker 仅在生产环境注册
 * ============================================================================
 */

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
