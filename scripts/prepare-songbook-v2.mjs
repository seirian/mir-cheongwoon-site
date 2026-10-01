import {readFile,writeFile} from 'node:fs/promises';
import {publicSong} from '../src/lib/songbookV2.js';
const raw=JSON.parse(await readFile('src/data/songbookData.json','utf8'));
let ratings={};try{ratings=JSON.parse(await readFile('src/data/songbookDifficulty.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const catalog=raw.songs.map(s=>publicSong({...s,videoUrls:s.videoLinks.map(v=>v.url),difficulty:ratings[s.id]??null,proficiency:null}));
if(catalog.length!==342||new Set(catalog.map(s=>s.id)).size!==342)throw Error('Unexpected initial catalog');
await writeFile('src/data/songbookCatalog.json',JSON.stringify(catalog,null,2)+'\n');
console.log('Prepared public catalog:',catalog.length,'rated:',catalog.filter(s=>s.difficulty).length);
