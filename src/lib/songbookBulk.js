import {publicSong,validateEntry} from './songbookV2.js';
import {REQUEST_STATES} from './songbookUsage.js';

export const SONGBOOK_PAGE_SIZES=Object.freeze([10,25,50,100]);
export const SONGBOOK_COVER_PAGE_SIZES=Object.freeze([24,48,96]);
export const songbookPageSizes=layout=>layout==='cover'?SONGBOOK_COVER_PAGE_SIZES:SONGBOOK_PAGE_SIZES;
export function songbookPageSize(value,layout='list') {
  return songbookPageSizes(layout).find(n=>String(n)===String(value))||(layout==='cover'?24:25);
}
export function songbookPage(items,requested,size,layout='list') {
  const pageSize=songbookPageSize(size,layout),pages=Math.max(1,Math.ceil(items.length/pageSize)),n=Number(requested);
  const page=Math.max(1,Math.min(pages,Number.isFinite(n)?Math.floor(n):1));
  return {page,pages,pageSize,items:items.slice((page-1)*pageSize,page*pageSize)};
}

// Existing rows use a status-only PATCH, never a full stale copy of song metadata.
// Catalog/automatic-only songs need an initial override row, excluding automatic media.
export function statusWriteJob(song,previous,target,status) {
  if(!Object.hasOwn(REQUEST_STATES,status))throw Error('변경할 신청 상태를 선택해 주세요.');
  if(!song||song.id!==target.id)throw Error('삭제되었거나 현재 목록에 없는 곡입니다.');
  const revision=previous?.revision||0;
  if(!Number.isInteger(target.expectedRevision)||target.expectedRevision!==revision)throw Error('다른 화면에서 변경된 곡입니다. 목록을 다시 불러온 뒤 확인해 주세요.');
  if(song.requestStatus===status)return {id:song.id,unchanged:true};
  const payload=previous?{id:song.id,request_status:status}:validateEntry({...publicSong(song),videoUrls:song.manualVideoUrls??song.videoUrls,requestStatus:status},{allowUnknownArtist:true});
  return {id:song.id,payload,previous};
}

// Sequential bounded writes deliberately report partial results; never retry a write
// automatically after a lost response, and never claim an all-or-nothing transaction.
export async function runStatusBatch(targets,status,{prepare,write,allowed,committed=()=>{},progress=()=>{}}) {
  if(!Object.hasOwn(REQUEST_STATES,status))throw Error('변경할 신청 상태를 선택해 주세요.');
  if(!Array.isArray(targets)||!targets.length||targets.length>100||targets.some(t=>!t||typeof t.id!=='string'||!t.id)||new Set(targets.map(t=>t.id)).size!==targets.length)throw Error('현재 페이지에서 1~100곡을 선택해 주세요.');
  const results=[];
  for(const target of targets) {
    let result;
    try {
      if(!allowed())throw Error('관리자 로그인 상태가 변경되었습니다. 다시 확인해 주세요.');
      const job=prepare(target,status);
      if(job.unchanged)result={id:target.id,title:target.title,outcome:'unchanged'};
      else {
        const saved=await write(job);
        if(!saved||saved.id!==target.id||saved.request_status!==status)throw Error('서버 저장 결과를 확인하지 못했습니다. 목록을 다시 불러와 확인해 주세요.');
        committed(saved);
        result={id:target.id,title:target.title,outcome:'updated'};
      }
    } catch(error) {
      result={id:target.id,title:target.title,outcome:'failed',message:error?.message||'저장 결과를 확인하지 못했습니다. 목록을 다시 불러와 확인해 주세요.'};
    }
    results.push(result);progress(results.length,targets.length);
  }
  return {results,updated:results.filter(r=>r.outcome==='updated').length,unchanged:results.filter(r=>r.outcome==='unchanged').length,failed:results.filter(r=>r.outcome==='failed').length};
}
