import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getPageMetadata, metadataRoutes } from '../src/data/pageMetadata.js';

const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export function renderPageHead(html, meta) {
  const clean = html.replace(/<title>[\s\S]*?<\/title>/i, '').replace(/<meta\s+[^>]*(?:name=["'](?:description|robots|twitter:[^"']*)["']|property=["']og:[^"']*["'])[^>]*>/gi, '').replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>/gi, '');
  const tags = [`<title>${escape(meta.title)}</title>`, `<link rel="canonical" href="${escape(meta.canonical)}" />`];
  for (const [name, value] of Object.entries({ description: meta.description, robots: meta.robots, 'twitter:card': 'summary_large_image', 'twitter:title': meta.title, 'twitter:description': meta.description, 'twitter:image': meta.image })) tags.push(`<meta name="${name}" content="${escape(value)}" />`);
  for (const [property, value] of Object.entries({ 'og:type': 'website', 'og:locale': 'ko_KR', 'og:title': meta.title, 'og:description': meta.description, 'og:url': meta.canonical, 'og:image': meta.image, 'og:image:alt': meta.imageAlt, 'og:image:width': '1200', 'og:image:height': '630' })) tags.push(`<meta property="${property}" content="${escape(value)}" />`);
  return clean.replace('</head>', tags.join('\n    ') + '\n  </head>');
}
export async function writePageMetadata(outDir, assetBase, preview) {
  const original = await readFile(path.join(outDir, 'index.html'), 'utf8');
  for (const route of metadataRoutes) {
    const directory = path.join(outDir, route.slice(1));
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'index.html'), renderPageHead(original, getPageMetadata(route, { preview, assetBase })), 'utf8');
  }
  console.log(`Generated per-route HTML metadata for ${metadataRoutes.length} pages${preview ? ' (noindex preview)' : ''}.`);
}
