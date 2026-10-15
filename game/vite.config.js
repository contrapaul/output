import { defineConfig } from "vite";

// base: "./" makes asset paths relative so the build works at the root of any
// host (Vercel, Netlify, Surge) AND on a subpath (GitHub Pages user.github.io/repo).
// This app uses ?level= query params (not path routing), so relative paths are safe.
export default defineConfig({
  base: "./",
  build: {
    target: "es2018", // broad browser support for school/low-spec machines
  },
});
