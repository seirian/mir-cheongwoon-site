/** Build an isolated UI; no production app/auth imports, API endpoints or credentials are shipped. */
import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {timelineSongs} from '../src/lib/songbookTimeline.js';
import {visibleSongs} from '../src/lib/songbookDeletion.js';
import {cleanSong,parseSnapshot,SAMPLE_SONGS} from '../src/songbook-check/model.js';
const fixture=process.argv.includes('--fixture');
const base=process.env.CHECK_BASE||'/_test_check/';
if(!/^\/(?:_test_check|_yeop_releases\/r\d{14}_[a-f\d]{8})\/$/.test(base))throw Error('Unexpected preview base');
let snapshot;
if(fixture){snapshot={version:1,capturedAt:new Date().toISOString(),songs:SAMPLE_SONGS};}
else {
 const env=Object.fromEntries((await readFile('.env.local','utf8')).trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1).trim()];}));
 const host=env.VITE_SUPABASE_URL?.replace(/\/$/,'');const key=env.VITE_SUPABASE_ANON_KEY;
 if(host!=='https://nohboljeugjmtwnvtayu.supabase.co'||!key)throw Error('Verified public configuration required');
 async function rows(table,columns,order='id') {
  const output=[];
  for(let page=0;page<20;page++) {
   const url=new URL(`${host}/rest/v1/${table}`);url.search=new URLSearchParams({select:columns,order:`${order}.asc`,offset:String(page*500),limit:'500'});
   const response=await fetch(url,{method:'GET',headers:{apikey:key,Accept:'application/json'},signal:AbortSignal.timeout(30000),redirect:'error'});
   if(!response.ok)throw Error(`Public snapshot read failed: ${table} HTTP ${response.status}`);
   const data=await response.json();if(!Array.isArray(data))throw Error(`Invalid ${table} response`);
   output.push(...data);if(data.length<500)return output;
  }
  throw Error('Snapshot too large; refusing a partial catalog');
 }
 const [entries,ratings,automatic,media,deletions]=await Promise.all([
  rows('songbook_entries','id,title,artist,categories,aliases,video_urls,difficulty,request_status,artwork_url,music_url,album_title'),
  rows('songbook_ratings','song_id,proficiency','song_id'),
  rows('songbook_auto_entries','id,title,artist,categories,aliases,request_status'),
  rows('songbook_auto_media','id,video_urls,total_count'),
  rows('songbook_deletions','song_id','song_id'),
 ]);
 const catalog=JSON.parse(await readFile('src/data/songbookCatalog.json','utf8'));
 const songs=visibleSongs(timelineSongs(catalog,entries,ratings,automatic,media),deletions).map(cleanSong);
 snapshot={version:1,capturedAt:new Date().toISOString(),songs};
}
snapshot=parseSnapshot(snapshot);
const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','vite.songbook-check.config.js','--base',base],{stdio:'inherit'});
if(result.status!==0)throw Error('Preview build failed');
const out='dist-songbook-check';
let html=await readFile(`${out}/songbook-check.html`,'utf8');
const rid=process.env.RELEASE_ID||'local-check';
if(rid!=='local-check'&&!/^r\d{14}_[a-f\d]{8}$/.test(rid))throw Error('Invalid release');
html=html.replace('</head>',`<meta name="yeop-release" content="${rid}" /></head>`);
await mkdir(`${out}/songbook`,{recursive:true});
for(const name of ['index.html','songbook/index.html','songbook-check.html'])await writeFile(`${out}/${name}`,html);
await writeFile(`${out}/.htaccess`, `# Static songbook review only; no production routing changes.
Options -Indexes
DirectoryIndex index.html
DirectorySlash Off
RewriteEngine On
RewriteOptions AllowNoSlash
RewriteRule ^(?:songbook/?)?$ songbook/index.html [END]
`);
await copyFile('public/icon_img.png',`${out}/icon_img.png`);
await writeFile(`${out}/songbook-check-snapshot.json`,JSON.stringify(snapshot));
await writeFile(`${out}/check-version.json`,JSON.stringify({preview:true,reviewVersion:2,release:rid,commit:process.env.SOURCE_COMMIT||'local',snapshotAt:snapshot.capturedAt,count:snapshot.songs.length}));
for(const entry of await readdir(`${out}/assets`)){
 const text=await readFile(`${out}/assets/${entry}`,'utf8');
 for(const disallowed of ['supabase.co','service_role','/auth/v1/','songbook_entries','gurmir.com','mir427.vercel.app','originalProficiency'])if(text.includes(disallowed))throw Error(`Unexpected production dependency in ${entry}`);
}
console.log(`Isolated preview built: ${snapshot.songs.length} public-copy songs. No production write APIs included.`);
