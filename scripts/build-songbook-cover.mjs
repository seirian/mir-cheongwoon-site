/** Build an isolated UI; no production app/auth imports, API endpoints or credentials are shipped. */
import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {timelineSongs} from '../src/lib/songbookTimeline.js';
import {visibleSongs} from '../src/lib/songbookDeletion.js';
import {cleanSong,parseSnapshot,SAMPLE_SONGS} from '../src/songbook-check/model.js';
const fixture=process.argv.includes('--fixture');
const base=process.env.COVER_BASE||'/_test_cover/';
if(!/^\/(?:_test_cover|_yeop_releases\/r\d{14}_[a-f\d]{8})\/$/.test(base))throw Error('Unexpected preview base');
let snapshot;
if(fixture){
 const originals=SAMPLE_SONGS;
 const songs=Array.from({length:106},(_,i)=>cleanSong({...originals[i%originals.length],id:`cover-fixture-${String(i).padStart(3,'0')}`,title:`커버검증 ${String(i).padStart(3,'0')} ${originals[i%originals.length].title}`}));
 snapshot={version:1,capturedAt:new Date().toISOString(),songs};
}
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
  rows('songbook_entries','id,title,artist,categories,aliases,video_urls,difficulty,request_status,artwork_url,music_url,album_title,public_note,video_kinds'),
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
const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','vite.songbook-cover.config.js','--base',base],{stdio:'inherit'});
if(result.status!==0)throw Error('Preview build failed');
const out='dist-songbook-cover';
let html=await readFile(`${out}/songbook-cover.html`,'utf8');
const rid=process.env.RELEASE_ID||'local-cover';
if(rid!=='local-cover'&&!/^r\d{14}_[a-f\d]{8}$/.test(rid))throw Error('Invalid release');
html=html.replace('</head>',`<meta name="yeop-release" content="${rid}" /></head>`);
await mkdir(`${out}/songbook`,{recursive:true});
for(const name of ['index.html','songbook/index.html','songbook-cover.html'])await writeFile(`${out}/${name}`,html);
await writeFile(`${out}/.htaccess`, `# Static songbook review only; no production routing changes.
Options -Indexes
DirectoryIndex index.html
DirectorySlash Off
RewriteEngine On
RewriteOptions AllowNoSlash
RewriteRule ^(?:songbook/?)?$ songbook/index.html [END]
`);
await copyFile('public/icon_img.png',`${out}/icon_img.png`);
await writeFile(`${out}/songbook-cover-snapshot.json`,JSON.stringify(snapshot));
await writeFile(`${out}/cover-version.json`,JSON.stringify({preview:true,reviewVersion:2,release:rid,commit:process.env.SOURCE_COMMIT||'local',snapshotAt:snapshot.capturedAt,count:snapshot.songs.length}));
for(const entry of await readdir(`${out}/assets`)){
 const text=await readFile(`${out}/assets/${entry}`,'utf8');
 for(const disallowed of ['supabase.co','service_role','/auth/v1/','songbook_entries','gurmir.com','mir427.vercel.app','originalProficiency','api/songbook-search.php'])if(text.includes(disallowed))throw Error(`Unexpected production dependency in ${entry}`);
}
console.log(`Isolated preview built: ${snapshot.songs.length} public-copy songs. No production write APIs included.`);
