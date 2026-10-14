import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

// The review tool for the Hungarian Neume Catalogue (../neuma-import): in development its plugin serves the
// module's data folder and keeps the decisions made in the tool; on the site the tool reads the same files
// from hung/ and keeps the decisions in the browser. The plugin is not part of a build. The tool itself
// uses two plain files of the module (how a documentation is made, how decisions are read), which lie
// outside this folder, so the development server is allowed to serve from the folder above.
async function neumaImport() {
  const file = fileURLToPath(new URL('../neuma-import/vite-plugin.mjs', import.meta.url))
  if (!existsSync(file)) return null
  return (await import(pathToFileURL(file).href)).neumaData()
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [vue(), scriptPolicy, await neumaImport()].filter(Boolean),
  server: { fs: { allow: ['..'] } },
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
}))
