// @ts-check
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  site: 'https://donnees-immo.fr',
  // Flat URLs with no trailing slash, matching the scheme in CLAUDE.md:
  // /prix-immobilier-bordeaux, not /prix-immobilier-bordeaux/. This keeps the
  // canonical tag, the sitemap and the internal links on one spelling, so a
  // page is never reachable under two addresses.
  //
  // `directory` rather than `file`: both serve the same URL on Cloudflare
  // Pages, but under `file` the canonical is built from a pathname that ends
  // in `.html`, which points at an address Cloudflare redirects away from.
  trailingSlash: 'never',
  build: { format: 'directory', inlineStylesheets: 'auto' },
  // The sitemap is a route, not an integration — see src/pages/sitemap.xml.js.
  vite: { plugins: [tailwindcss()] },
})
