import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import compression from 'vite-plugin-compression';

export default defineConfig(({ mode }) => {
  // 加载环境变量（从项目根目录的 .env 文件）
  const env = loadEnv(mode, process.cwd(), '');
  const serverPort = parseInt(env.PORT || '3001', 10);
  const vitePort = parseInt(env.VITE_PORT || '5180', 10);

  return {
    plugins: [
      react(),

      // 构建分析工具 — 仅在 analyze 模式下启用
      mode === 'analyze' && visualizer({
        filename: 'stats.html',
        open: true,
        gzipSize: true,
        brotliSize: true,
        template: 'treemap',
      }),

      // gzip 压缩
      compression({
        algorithm: 'gzip',
        ext: '.gz',
        threshold: 1024, // 仅压缩大于 1KB 的文件
        deleteOriginFile: false, // 保留原始文件
      }),

      // brotli 压缩（压缩率更高）
      compression({
        algorithm: 'brotliCompress',
        ext: '.br',
        threshold: 1024,
        deleteOriginFile: false,
      }),
    ].filter(Boolean),

    build: {
      // 面向现代浏览器，减少 polyfill 开销
      target: 'es2020',
      // 使用 terser 压缩（比 esbuild 多 5-15% 压缩率，支持 drop_console）
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,   // 生产构建移除所有 console.* 调用
          drop_debugger: true,
          passes: 2,
        },
        mangle: { safari10: true },
      },
      // CSS 按 chunk 拆分（配合 JS 懒加载）
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          // 函数式 manualChunks：更精细地控制分包策略
          manualChunks(id) {
            if (id.includes('node_modules')) {
              // Zego WebRTC SDK 单独分包（动态导入，按需加载）
              if (id.includes('zego-express-engine-webrtc')) {
                return 'zego-webrtc';
              }
              // React 生态单独分包（长期缓存）
              if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
                return 'vendor-react';
              }
              // 其余第三方库归入 vendor（含 zustand、protobufjs 等）
              return 'vendor';
            }
          },
        },
      },
      // Zego SDK 本身较大，提高警告阈值避免干扰
      chunkSizeWarningLimit: 700,
    },

    server: {
      host: '0.0.0.0',
      port: vitePort,
      strictPort: true,
      allowedHosts: true,
      // 开发环境 WebSocket 代理到后端
      proxy: {
        '/ws': {
          target: `ws://localhost:${serverPort}`,
          ws: true,
          changeOrigin: true,
        },
        '/api': {
          target: `http://localhost:${serverPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
