/** Build the real review component into an offline, test-only HTML document. */
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const out=resolve(process.argv[2]||'/tmp/songbook-review-fixture.html');
const result=await build({entryPoints:['tests/fixtures/songbook-review.jsx'],bundle:true,write:false,outdir:'/tmp/songbook-ui-build',jsx:'automatic',format:'iife',define:{'import.meta.env':'{}','process.env.NODE_ENV':'"production"'},loader:{'.png':'dataurl','.jpg':'dataurl','.svg':'dataurl','.woff2':'dataurl'}});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text,css=result.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'';
await mkdir(resolve(out,'..'),{recursive:true});
await writeFile(out,`<!doctype html><html lang="ko"><meta charset="utf-8"><style>${css}\nbody{background:#111420;color:#e9eefb}.fixture-controls{padding:12px;display:flex;flex-wrap:wrap;gap:10px}.fixture-spacer{height:350px;padding:30px}.sb-auto-admin{margin:20px}</style><div id="root"></div><script>${js.replace(/<\/script/gi,'<\\/script')}</script></html>`);
console.log('Built offline review fixture:',out);
