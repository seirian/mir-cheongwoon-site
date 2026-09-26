import { readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const php = process.argv.includes('--php');
const roots = php ? ['server'] : ['src', 'scripts', 'netlify', 'tests', 'vite.config.js'];

function* files(path) {
  if (extname(path)) {
    yield path;
    return;
  }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) yield* files(child);
    else if (entry.isFile()) yield child;
  }
}

let count = 0;
for (const path of roots.flatMap((root) => [...files(root)])) {
  if (!(php ? ['.php'] : ['.js', '.mjs']).includes(extname(path))) continue;
  const result = spawnSync(php ? 'php' : process.execPath, [php ? '-l' : '--check', path], {
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`Cannot run ${php ? 'PHP (install PHP and add it to PATH)' : 'Node'}: ${result.error.message}`);
  }
  if (result.error || result.status !== 0) process.exit(1);
  count += 1;
}
console.log(`Syntax OK: ${count} ${php ? 'PHP' : 'JavaScript'} files. JSX is checked by Vite build.`);
