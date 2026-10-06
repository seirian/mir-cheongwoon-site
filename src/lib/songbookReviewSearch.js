import {REVIEW_PAGE_SIZE,REVIEW_TABS} from './songbookReviewState.js';

export const REVIEW_SEARCH_MAX = 200;
export function reviewSearchQuery(value) {
  return typeof value==='string' ? value.normalize('NFKC').replace(/\s+/gu,' ').trim().slice(0,REVIEW_SEARCH_MAX) : '';
}
/** Search is server-side before pagination. Do not filter just the eight visible rows. */
export async function fetchReviewCandidates(client,{tab,page,query=''}) {
  if(!REVIEW_TABS.includes(tab)||!Number.isInteger(page)||page<0||page>=10000)throw Error('검색 조건을 확인해 주세요.');
  const q=reviewSearchQuery(query);
  if(!q)return client.from('songbook_timeline_candidates').select('id,vod_id,seconds,approved_seconds,title,artist,reason,line,revision,song_id,decision',{count:'exact'}).eq('present',true).eq('decision',tab).order('first_seen_at',{ascending:false}).order('id').range(page*REVIEW_PAGE_SIZE,page*REVIEW_PAGE_SIZE+REVIEW_PAGE_SIZE-1);
  const result=await client.rpc('songbook_review_search',{p_decision:tab,p_query:q,p_page:page,p_page_size:REVIEW_PAGE_SIZE},{get:true});
  if(result.error)return {data:null,count:null,error:result.error};
  if(!Array.isArray(result.data?.rows)||!Number.isSafeInteger(result.data?.count)||result.data.count<0)throw Error('검색 응답을 확인하지 못했습니다. 다시 검색해 주세요.');
  return {data:result.data.rows,count:result.data.count,error:null};
}
