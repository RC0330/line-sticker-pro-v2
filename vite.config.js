import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // 使用相對路徑，讓同一包程式可部署在 GitHub Pages 的 /repo-name/ 子路徑，
  // 也可部署在自訂網域根目錄，不需要每次修改 repository 名稱。
  base: "./",

  build: {
    chunkSizeWarningLimit: 20000,
    rollupOptions: {
      output: {
        manualChunks: {
          opencv: ["@techstark/opencv-js"],
          zip: ["jszip", "file-saver"],
        },
      },
    },
  },

  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png"],
      workbox: {
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        navigateFallback: null,
      },
      manifest: {
        name: "LINE Sticker PRO v15",
        short_name: "StickerPRO",
        description: "LINE 貼圖裁切、去底、透明 PNG 匯出工具",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "any",
        start_url: ".",
        scope: ".",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
});
