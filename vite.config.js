import { defineConfig, loadEnv } from 'vite';
import { writePageMetadata } from './scripts/page-metadata.mjs';
import react from '@vitejs/plugin-react';

let resolvedConfig;
let buildSucceeded = false;
export default defineConfig({
  plugins: [react(), {
    name: 'per-route-share-metadata',
    apply: 'build',
    configResolved(config) { resolvedConfig = config; },
    buildStart() { buildSucceeded = false; },
    buildEnd(error) { buildSucceeded = !error; },
    async closeBundle() {
      // Preserve the original compiler error instead of masking it with missing dist/index.html.
      if (!buildSucceeded) return;
      const config = resolvedConfig;
      const env = { ...loadEnv(config.mode, process.cwd(), ''), ...process.env };
      await writePageMetadata(config.build.outDir, config.base, env.VITE_REVIEW_PREVIEW === 'true');
    },
  }],
});
