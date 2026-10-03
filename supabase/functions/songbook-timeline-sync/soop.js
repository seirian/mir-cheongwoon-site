/** Public read operations only. Never downloads audio, logs in, or attempts restricted content. */
import {BBS,CHANNEL,STATION,SINCE,publicVod,textOnly,hexHash} from './core.js';
const LIST='https://chapi.sooplive.co.kr/api/alice427/vods';
const COMMENTS='https://stbbs.sooplive.com/api/bbs_memo_action.php';
export function soopReader(fetcher=fetch, wait=ms=>new Promise(r=>setTimeout(r,ms))) {
  let last=0, requests=0, deadline=Infinity;
  async function read(url,args) {
    if (Date.now()+16000>deadline) throw Error('scan_time_budget');
    if (![LIST,COMMENTS].includes(url)) throw Error('untrusted_host');
    if (url===COMMENTS && !['get','get_reply'].includes(args.szAction)) throw Error('read_actions_only');
    await wait(Math.max(0,650-(Date.now()-last)));last=Date.now();requests++;
    const response=await fetcher(url+'?'+new URLSearchParams(args),{redirect:'error',headers:{'Accept':'application/json','User-Agent':'MirSongbookTimeline/1.0 (https://mir.yeop.net)','Referer':'https://vod.sooplive.com/'},signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw Error(`soop_http_${response.status}`);
    const reader=response.body.getReader(), decoder=new TextDecoder();let body='',bytes=0;
    while (true) {const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2500000){await reader.cancel();throw Error('soop_response_limit');}body+=decoder.decode(value,{stream:true});}
    body+=decoder.decode();return JSON.parse(body);
  }
  async function inventory(after=SINCE) {
    const result=[],seen=new Set();let complete=false,cutoff=false;
    for(let page=1;page<=80;page++) {
      const data=await read(LIST,{page,per_page:60,type:'REVIEW',orderby:'reg_date'});
      if(!Array.isArray(data.data)||Number(data.meta?.current_page)!==page)throw Error('vod_list_contract');
      for(const row of data.data){const vod=publicVod(row);if(!vod)continue;if(Date.parse(vod.uploaded_at)<after){cutoff=true;continue;}if(!seen.has(vod.id)){seen.add(vod.id);result.push(vod);}}
      if(cutoff||!data.data.length||page>=Number(data.meta.last_page)){complete=true;break;}
    }
    if(!complete)throw Error('vod_page_limit');return result;
  }
  async function minimal(c,parent='') {
    const text=textOnly(String(c.comment||''));
    if((text.match(/\d{1,3}:\d{2}(?::\d{2})?/g)||[]).length<2&&!/[🎵🎶🎤♪♫]/u.test(text))return null;
    return {id:String(c.c_comment_no||c.p_comment_no),parent_id:String(parent),text,created_at:String(c.reg_date||''),author_hash:await hexHash(String(c.user_id||''))};
  }
  async function comments(vod) {
    if(vod.channel_id!==CHANNEL||Number(vod.station_no)!==STATION||Number(vod.bbs_no)!==BBS||!/^\d{6,12}$/.test(String(vod.id)))throw Error('vod_identity');
    const base={nStationNo:STATION,nBbsNo:BBS,nTitleNo:vod.id,bj_id:CHANNEL,nBoardType:105,nVod:1};
    const roots=[],seen=new Set();let cursor=0,expected=0,complete=false,replyCount=0;
    for(let page=1;page<=20;page++) {
      const j=await read(COMMENTS,{...base,szAction:'get',nPageNo:page,nOrderNo:1,nLastNo:cursor});
      if(Number(j.CHANNEL?.RESULT)!==1)throw Error('comment_unavailable');
      const d=j.CHANNEL.DATA;if(d?.user_data?.writer_id!==CHANNEL||!Array.isArray(d.list_data))throw Error('comment_channel_contract');
      expected=Number(d.total_cnt);if(!Number.isInteger(expected)||expected<0)throw Error('comment_count_contract');
      for(const c of d.list_data){if(String(c.title_no)!==String(vod.id))throw Error('comment_vod_contract');const id=String(c.p_comment_no);if(!seen.has(id)){roots.push(c);seen.add(id);}}
      if(!d.has_more){complete=true;break;}
      const next=d.list_data.at(-1)?.p_comment_no;if(!next||String(next)===String(cursor))throw Error('comment_pagination_stalled');cursor=next;
    }
    if(!complete||roots.length<expected)throw Error('comments_incomplete');
    const records=[];
    for(const c of roots){
      const item=await minimal(c);if(item)records.push(item);
      if(Number(c.c_comment_cnt)>0){
        const j=await read(COMMENTS,{...base,szAction:'get_reply',nParentCommentNo:c.p_comment_no});
        const d=j.CHANNEL?.DATA;
        if(Number(j.CHANNEL?.RESULT)!==1||!Array.isArray(d?.list_data)||d.has_more||d.list_data.length<Math.max(Number(d.total_cnt??0),Number(c.c_comment_cnt)))throw Error('replies_incomplete');
        for(const r of d.list_data){if(String(r.p_comment_no)!==String(c.p_comment_no))throw Error('reply_parent_contract');replyCount++;const item=await minimal(r,c.p_comment_no);if(item)records.push(item);}
      }
      if(records.length>300)throw Error('timeline_count_limit');
    }
    return {comments:records,root_count:roots.length,reply_count:replyCount,complete:true};
  }
  return {inventory,comments,requestCount:()=>requests,setDeadline:value=>{deadline=value;}};
}
