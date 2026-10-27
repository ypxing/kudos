import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  // Relative asset paths: the page is served from a bucket path, not the host root.
  base: "./",
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
    target: "es2022",
  },
});
