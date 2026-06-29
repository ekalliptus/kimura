// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // SSR on Cloudflare Workers. `cloudflare:workers` env + Supabase only resolve
  // in server-rendered routes. Opt static pages in with `export const prerender = true`.
  output: 'server',
  adapter: cloudflare({
    // We serve remote images (Cloudbeds CDN) and don't use Astro's <Image/>,
    // so skip the Cloudflare Images binding requirement.
    imageService: 'passthrough',
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
