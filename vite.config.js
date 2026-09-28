import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/live-tide/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        moods: resolve(__dirname, "moods.html"),
      },
    },
  },
});
