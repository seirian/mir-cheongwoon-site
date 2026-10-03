/** First backfill only. Workload identity is scoped to this main/develop workflow by the Edge handler. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {soopReader} from '../supabase/functions/songbook-timeline-sync/soop.js';
import {eligible} from '../supabase/functions/songbook-timeline-sync/core.js';
const endpoint='https://nohboljeugjmtwnvtayu.supabase.co/functions/v1/songbook-timeline-sync';
const audience='https://mir.yeop.net/songbook-timeline';
let token='',expiry=0;
async function oidc(){
 if(token&&Date.now()<expiry)return token;
 const u=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);u.searchParams.set('audience',audience);
 const r=await fetch(u,{headers:{Authorization:`Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`},signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('workload_identity_unavailable');const d=await r.json();if(typeof d.value!=='string')throw Error('workload_identity_contract');token=d.value;expiry=Date.now()+3*60000;return token;
}
async function call(body){const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-github-oidc':await oidc()},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});let d;try{d=await r.json();}catch{throw Error('sync_response');}if(!r.ok)throw Error(d.error||'sync_unavailable');return d;}
await mkdir('songbook-timeline-report',{recursive:true});
const base=JSON.parse(await readFile('src/data/songbookCatalog.json','utf8'));
await call({action:'catalog_seed',songs:base.map(s=>({id:s.id,title:s.title,artist:s.artist,aliases:s.aliases||[]}))});
const start=await call({action:'begin'});
if(start.status!=='running'){console.log('Backfill:',start.status);process.exit(0);}
const run_id=start.run_id,source=soopReader();let checked=0,failures=0;
try{
 const inventory=await source.inventory();
 for(let i=0;i<inventory.length;i+=200)await call({action:'inventory',run_id,vods:inventory.slice(i,i+200),complete:i+200>=inventory.length});
 let cached=new Map();
 try{
  const lines=(await readFile('timeline-audit/vods.jsonl','utf8')).trim().split('\n').map(JSON.parse);
  cached=new Map(lines.filter(r=>r.complete).map(r=>[r.vod.id,r]));
 }catch{/* Expired audit artifacts do not prevent a future re-run: read public comments anew. */}
 for(const vod of inventory){
  if(!eligible(vod))continue;
  try{
   const previous=cached.get(vod.id);
   const scan=previous&&previous.vod.uploaded_at===vod.uploaded_at&&previous.vod.duration_seconds===vod.duration_seconds?previous:await source.comments(vod);
   await call({action:'ingest',run_id,vod_id:vod.id,scan:{complete:scan.complete,comments:scan.comments,root_count:scan.root_count,reply_count:scan.reply_count}});
   checked++;
  }catch(e){failures++;await call({action:'failure',run_id,vod_id:vod.id,error:'scan_or_ingest_failure'});if(failures>10)throw Error('repeated_scan_failure');}
  if((checked+failures)%30===0)console.log('VODs checked:',checked,'errors:',failures);
 }
 const finish=await call({action:'finish',run_id});
 await writeFile('songbook-timeline-report/backfill.json',JSON.stringify({run_id,inventory:inventory.length,eligible:inventory.filter(v=>eligible(v)).length,waiting:inventory.filter(v=>v.public&&!eligible(v)).length,restricted:inventory.filter(v=>!v.public).length,checked,failures,result:finish},null,2));
 console.log('Backfill:',finish.status,'checked:',checked,'errors:',failures);
 if(failures)process.exitCode=1;
}catch(e){try{await call({action:'finish',run_id,error:'backfill_interrupted'});}catch{}throw Error('backfill_interrupted');}
