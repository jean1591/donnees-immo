// @ts-check
import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { DATASET } from './src/lib/dataset.js'

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
  integrations: [
    // Every page is regenerated from the same DVF release, so they share one
    // lastmod. Without it crawlers have no signal that 3730 pages changed at
    // once when the dataset is refreshed twice a year.
    sitemap({
      serialize: (item) => ({ ...item, lastmod: DATASET.releaseDate }),
    }),
  ],
  vite: { plugins: [tailwindcss()] },
})
