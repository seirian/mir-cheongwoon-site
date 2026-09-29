import test from 'node:test';
import assert from 'node:assert/strict';
import { HERO_LIVE_URL, heroPath, heroFolder, validateHeroFile, detectHeroMime, createHeroPreviewFetch, readHeroImage, saveHeroImage } from '../src/lib/heroImage.js';

test('hero v2: requested live is pinned without tracking and preview object is isolated', () => {
  assert.equal(HERO_LIVE_URL, 'https://www.youtube.com/watch?v=Gh4PqvQVWRc');
  assert.notEqual(heroPath(true), heroPath(false));
  assert.ok(heroPath(true).startsWith('site-hero/promotion-discovery-preview/'));
});
test('hero v2: reject empty, oversized, executable and unsupported files', () => {
  for (const file of [null, {size:0,type:'image/png'}, {size:6*1024*1024,type:'image/png'}, {size:20,type:'image/svg+xml'}, {size:20,type:'text/html'}]) assert.throws(() => validateHeroFile(file));
  assert.doesNotThrow(() => validateHeroFile({size:200,type:'image/png'}));
  assert.equal(detectHeroMime(new Uint8Array([137,80,78,71,13,10,26,10])), 'image/png');
  assert.equal(detectHeroMime(new Uint8Array([255,216,255,224])), 'image/jpeg');
  assert.equal(detectHeroMime(new TextEncoder().encode('RIFF0000WEBP')), 'image/webp');
  assert.equal(detectHeroMime(new TextEncoder().encode('<html>')), '');
});
test('hero v2: preview network guard blocks production and unrelated mutations before network', async () => {
  const calls=[]; const origin='https://example.supabase.co';
  const guarded=createHeroPreviewFetch(origin, async (url) => { calls.push(String(url)); return new Response('{}'); });
  for (const [path,method] of [
    [`/storage/v1/object/gallery/${heroPath(false)}`,'POST'], ['/rest/v1/band_members','PATCH'], ['/rest/v1/rpc/change_role','POST'], ['/auth/v1/signup','POST'], ['/auth/v1/user','PUT'], ['/storage/v1/object/gallery','DELETE'], ['/storage/v1/object/gallery/site-hero/promotion-discovery-preview/other.webp','POST'],
  ]) assert.equal((await guarded(origin+path,{method})).status,403);
  assert.equal((await guarded('https://untrusted.example/auth/v1/user')).status,403);
  assert.equal((await guarded(origin+'/storage/v1/object/list/gallery',{method:'POST',body:JSON.stringify({prefix:heroFolder(false),search:'current.webp',limit:1})})).status,403);
  assert.equal(calls.length,0);
  for (const [path,init] of [
    ['/auth/v1/token?grant_type=password',{method:'POST'}],['/auth/v1/user',{}],['/rest/v1/admins?select=user_id',{}],
    [`/storage/v1/object/gallery/${heroPath(true)}`,{method:'POST',body:new Blob(['raster'])}],
    ['/storage/v1/object/list/gallery',{method:'POST',body:JSON.stringify({prefix:heroFolder(true),search:'current.webp',limit:1})}],
  ]) assert.equal((await guarded(origin+path,init)).status,200);
  assert.equal(calls.length,5);
});
function client(admin=true, fail=false) {
  const calls=[];
  const storage={
    list:async (...args)=>{calls.push(['list',...args]);return {data:[{name:'current.webp',updated_at:'v2'}]};},
    getPublicUrl:(path)=>({data:{publicUrl:`https://example.supabase.co/storage/v1/object/public/gallery/${path}`}}),
    upload:async (...args)=>{calls.push(['upload',...args]);return {error:fail ? {message:'denied'} : null};},
  };
  return {calls,auth:{getUser:async()=>({data:{user:{id:'verified-user'}}})},from:()=>({select:()=>({eq:()=>({limit:async()=>({data:admin?[{user_id:'verified-user'}]:[]})})})}),storage:{from:()=>storage}};
}
test('hero v2: admin authorization is rechecked before every upload; nonadmin cannot write',async()=>{
  const c=client(false);await assert.rejects(saveHeroImage(c,new Blob(['image'],{type:'image/webp'}),true),/관리자/);assert.equal(c.calls.length,0);
});
test('hero v2: saved image is shared via persistent storage and survives a new reader',async()=>{
  const c=client();const blob=new Blob(['image'],{type:'image/webp'});
  assert.ok((await saveHeroImage(c,blob,true)).includes(heroPath(true)));
  assert.equal(c.calls[0][0],'upload');assert.equal(c.calls[0][1],heroPath(true));assert.equal(c.calls[0][3].upsert,true);
  assert.ok((await readHeroImage(client(),true)).endsWith('current.webp?v=v2'));
});
test('hero v2: storage failure propagates without replacing the current image',async()=>{
  await assert.rejects(saveHeroImage(client(true,true),new Blob(['image'],{type:'image/webp'}),true),/기존 이미지/);
});
