import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    open: true,
    host: true,
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'vendor-three';
          if (id.includes('/src/combat/')) return 'chunk-combat';
          // ai/ 只服务战斗场景（敌人状态机与围攻仲裁），与 combat 同块避免跨块循环
          if (id.includes('/src/ai/')) return 'chunk-combat';
          if (id.includes('/src/world/')) return 'chunk-world';
          if (id.includes('/src/ui/') || id.includes('/src/cinematic/')) return 'chunk-ui';
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
