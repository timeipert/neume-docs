import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// The signed-in GitHub token lives in this page's storage, so no script from anywhere else may run in it.
// Only scripts of this site (and its own worker, which may be a blob) are allowed; images, IIIF servers and
// GitHub's API are not limited. In development Vite injects what it needs, so this is for the build only.
const scriptPolicy = {
  name: 'script-policy',
  apply: 'build',
  transformIndexHtml: () => [{
    tag: 'meta',
    attrs: {
      'http-equiv': 'Content-Security-Policy',
      content: "script-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'"
    },
    injectTo: 'head-prepend'
  }]
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), scriptPolicy],
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
})
