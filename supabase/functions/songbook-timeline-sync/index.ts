import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {createRemoteJWKSet,jwtVerify} from 'npm:jose@6.1.0';
import {eligible,hexHash,newSongIdentity,nextCheck,prepareCandidates,validGithubClaims,CHANNEL,STATION,BBS,SINCE} from './core.js';
import {soopReader} from './soop.js';
const GH_AUDIENCE='https://mir.yeop.net/songbook-timeline';
const jwks=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'),{timeoutDuration:5000,cooldownDuration:30000});
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'https://mir.yeop.net','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-github-oidc, x-songbook-sync-token','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
function same(a:string,b:string){if(!a||a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
async function rpc(name:string,args:Record<string,unknown>){const r=await db.rpc(name,args);if(r.error)throw Error(r.error.message?.includes('candidate_changed')?'candidate_changed':`database_${name}`);return r.data;}
async function rows(table:string,filter?:(q:any)=>any){let all:any[]=[];for(let p=0;p<20;p++){let q=db.from(table).select('*').order('id').range(p*500,p*500+499);if(filter)q=filter(q);const r=await q;if(r.error)throw Error('database_read');all=all.concat(r.data);if(r.data.length<500)return all;}throw Error('database_read_limit');}
async function catalog(){const base=await db.from('songbook_sync_settings').select('base_catalog').eq('id',1).single();if(base.error||!Array.isArray(base.data?.base_catalog)||base.data.base_catalog.length<1)throw Error('base_catalog_unavailable');const baseCatalog=base.data.base_catalog;const [manual,automatic]=await Promise.all([rows('songbook_entries'),rows('songbook_auto_entries')]);const m=new Map([...baseCatalog,...automatic,...manual].map(s=>[s.id,s]));return [...m.values()];}
function validVod(v:any){return v&&v.channel_id===CHANNEL&&Number(v.station_no)===STATION&&Number(v.bbs_no)===BBS&&/^\d{6,12}$/.test(String(v.id))&&Date.parse(v.uploaded_at)>=SINCE&&Date.parse(v.uploaded_at)<Date.now()+300000&&Number.isInteger(v.duration_seconds)&&v.duration_seconds>0&&v.duration_seconds<=172800&&typeof v.public==='boolean'&&typeof v.title==='string'&&v.title.length<=200;}
async function ingest(run:string,vod:any,scan:any,trusted:string[]){
 if(!eligible(vod)||scan.complete!==true||!Array.isArray(scan.comments)||scan.comments.length>300||!Number.isInteger(scan.root_count)||!Number.isInteger(scan.reply_count))throw Error('incomplete_or_ineligible_scan');
 for(const c of scan.comments)if(typeof c.text!=='string'||c.text.length>120000||!/^\d{1,15}$/.test(c.id)||!/^[a-f0-9]{64}$/.test(c.author_hash))throw Error('comment_contract');
 const parsed=await prepareCandidates(vod,scan.comments,await catalog(),trusted);
 return rpc('songbook_sync_apply',{p_run:run,p_vod:vod.id,p_candidates:parsed,p_hash:await hexHash(JSON.stringify(scan.comments)),p_roots:scan.root_count,p_replies:scan.reply_count,p_next:nextCheck(vod)});
}
async function notice(run:any,force=false){
 const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
 if(!force&&run.status==='success'&&!(run.stats?.new_songs>0)&&hour!==2)return;
 try{
  const cfg=await db.from('schedule_monitor_config').select('discord_webhook_url').eq('id',1).single();const url=cfg.data?.discord_webhook_url;
  if(typeof url!=='string'||!/^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+$/.test(url))throw Error('notification_configuration');
  const content=`[노래책 자동 수집] ${run.status==='success'?'완료':run.status==='partial'?'일부 실패':'실패'}\n확인 VOD ${run.stats?.checked||0}개 · 신규 곡 ${run.stats?.new_songs||0}개 · 검토 포함 후보 ${run.stats?.candidates||0}건 · 오류 ${run.stats?.errors||0}건\n게시 7일 이후 타임라인 기준 / 관리자 검토는 노래책에서 확인`;
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content,allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw Error('notification_unavailable');await db.from('songbook_sync_runs').update({notification_status:'sent'}).eq('id',run.id);
 }catch{await db.from('songbook_sync_runs').update({notification_status:'failed'}).eq('id',run.id);}
}
async function tick(cfg:any,dry=false){
 const source=soopReader();
 if(dry){const vs=await source.inventory();const v=vs.find(v=>eligible(v));if(!v)return {inventory:vs.length,eligible:0};const scan=await source.comments(v);const cs=await prepareCandidates(v,scan.comments,await catalog(),cfg.trusted_authors);return {inventory:vs.length,vod:v.id,complete:scan.complete,candidates:cs.length,requests:source.requestCount(),dry_run:true};}
 const owner='cron:'+new Date().toISOString().slice(0,13), lease=await rpc('songbook_sync_begin',{p_owner:owner,p_backfill:false});
 if(lease.status!=='running')return lease;
 const id=lease.run_id,until=Date.now()+90000;source.setDeadline(until);let failure:string|null=null;
 try{
  if(!cfg.last_discovered_at||Date.now()-Date.parse(cfg.last_discovered_at)>23*3600000){
   const inventory=await source.inventory();for(let i=0;i<inventory.length;i+=200)await rpc('songbook_sync_inventory',{p_run:id,p_vods:inventory.slice(i,i+200),p_discovered_at:i+200>=inventory.length?new Date().toISOString():null});
  }
  const due=await db.from('songbook_sync_vods').select('*').eq('public',true).lte('next_check_at',new Date().toISOString()).order('next_check_at').limit(12);if(due.error)throw Error('database_due');
  for(const v of due.data){if(Date.now()>until)break;if(!eligible(v))continue;
   try{await ingest(id,v,await source.comments(v),cfg.trusted_authors);}
   catch(e){const code=safeError(e);await rpc('songbook_sync_fail',{p_run:id,p_vod:v.id,p_error:code});if(/soop_http_(401|403|429)/.test(code))break;}
  }
 }catch(e){failure=safeError(e);}
 const result=await rpc('songbook_sync_finish',{p_run:id,p_error:failure,p_backfill:false});await notice(result);return result;
}
function safeError(e:any){const s=String(e?.message||'unknown_failure');return /^[a-z0-9_ -]{1,120}$/i.test(s)?s:'upstream_or_contract_failure';}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{error:'method'});
 try{
  const length=Number(req.headers.get('content-length')||0);if(length>2000000)return reply(413,{error:'size'});
  const reader=req.body?.getReader();if(!reader)return reply(400,{error:'body'});let bytes=0,raw='';const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2000000){await reader.cancel();return reply(413,{error:'size'});}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();
  let body;try{body=JSON.parse(raw);}catch{return reply(400,{error:'json'});}if(!body||Array.isArray(body)||typeof body!=='object')return reply(400,{error:'body'});const cfgResult=await db.from('songbook_sync_settings').select('*').eq('id',1).single();if(cfgResult.error)throw Error('configuration_unavailable');const cfg=cfgResult.data;
  const secret=req.headers.get('x-songbook-sync-token')||'';
  if(secret){if(!same(secret,cfg.sync_token))return reply(401,{error:'unauthorized'});if(body.action!=='tick')return reply(403,{error:'operation'});return reply(200,await tick(cfg,body.dry_run===true));}
  // A normal site-admin JWT may only review a candidate. It cannot run arbitrary service-role operations.
  if(body.action==='review'){
   const bearer=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';const user=await db.auth.getUser(bearer);if(user.error||!user.data.user)return reply(401,{error:'unauthorized'});
   const admin=await db.from('admins').select('user_id').eq('user_id',user.data.user.id).maybeSingle();if(admin.error||!admin.data)return reply(403,{error:'admin_required'});
   let song:any={};
   if(body.decision==='approved'){
    if(!Number.isInteger(body.seconds)||body.seconds<0||body.seconds>172800)return reply(400,{error:'time_required'});
    if(body.song_id){const s=(await catalog()).find(x=>x.id===body.song_id);if(!s)return reply(400,{error:'unknown_song'});song={id:s.id,create:false};}
    else {if(typeof body.title!=='string'||typeof body.artist!=='string')return reply(400,{error:'song_required'});song=await newSongIdentity(body.title.trim(),body.artist.trim());}
   }
   const r=await rpc('songbook_sync_review',{p_admin:user.data.user.id,p_id:body.id,p_revision:body.revision,p_decision:body.decision,p_song:song,p_seconds:body.seconds??null});return reply(200,r);
  }
  // Backfill has workload identity, never a long-lived Supabase key in GitHub or in the browser.
  const token=req.headers.get('x-github-oidc')||'';if(!token)return reply(401,{error:'unauthorized'});
  let claims:any;try{claims=(await jwtVerify(token,jwks,{issuer:'https://token.actions.githubusercontent.com',audience:GH_AUDIENCE,algorithms:['RS256'],maxTokenAge:'10m'})).payload;}catch{return reply(401,{error:'unauthorized'});}
  if(!validGithubClaims(claims))return reply(403,{error:'untrusted_workflow'});
  const owner=`github:${claims.run_id}:${claims.run_attempt}`;
  if(body.action==='catalog_seed'){
   if(!Array.isArray(body.songs)||body.songs.length<1||body.songs.length>5000||body.songs.some((s:any)=>!/^mir-[a-f0-9]{12}$/.test(s.id)||typeof s.title!=='string'||!s.title||s.title.length>200||typeof s.artist!=='string'||!s.artist||s.artist.length>200||!Array.isArray(s.aliases)||s.aliases.some((a:any)=>typeof a!=='string'||a.length>200)))return reply(400,{error:'catalog_contract'});
   const clean=body.songs.map((s:any)=>({id:s.id,title:s.title,artist:s.artist,aliases:s.aliases}));
   const r=await db.from('songbook_sync_settings').update({base_catalog:clean}).eq('id',1);if(r.error)throw Error('catalog_seed_failed');return reply(200,{status:'seeded',songs:clean.length});
  }
  if(body.action==='begin')return reply(200,await rpc('songbook_sync_begin',{p_owner:owner,p_backfill:true}));
  if(!/^[a-f0-9-]{36}$/.test(String(body.run_id)))return reply(400,{error:'run_required'});
  const run=await db.from('songbook_sync_runs').select('id,owner,status').eq('id',body.run_id).single();if(run.error||run.data.owner!==owner||run.data.status!=='running')return reply(403,{error:'run_owner'});
  if(body.action==='inventory'){
   if(!Array.isArray(body.vods)||body.vods.length>200||body.vods.some((v:any)=>!validVod(v)))return reply(400,{error:'vod_contract'});
   return reply(200,{count:await rpc('songbook_sync_inventory',{p_run:body.run_id,p_vods:body.vods,p_discovered_at:body.complete===true?new Date().toISOString():null})});
  }
  if(body.action==='ingest'){
   const v=await db.from('songbook_sync_vods').select('*').eq('id',String(body.vod_id)).single();if(v.error)return reply(400,{error:'unknown_vod'});
   return reply(200,await ingest(body.run_id,v.data,body.scan,cfg.trusted_authors));
  }
  if(body.action==='failure'){await rpc('songbook_sync_fail',{p_run:body.run_id,p_vod:String(body.vod_id),p_error:safeError({message:body.error})});return reply(200,{status:'recorded'});}
  if(body.action==='finish'){const r=await rpc('songbook_sync_finish',{p_run:body.run_id,p_error:body.error?safeError({message:body.error}):null,p_backfill:true});await notice(r,true);return reply(200,r);}
  return reply(400,{error:'operation'});
 }catch(e){return reply(String(e?.message).includes('candidate_changed')?409:502,{error:safeError(e)});}
});
