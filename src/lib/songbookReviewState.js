export const REVIEW_TABS = ['pending','auto','approved','rejected','excluded'];
export const REVIEW_PAGE_SIZE = 8;
export function reviewPage(page,count) {
 return Math.min(Math.max(0,Number.isInteger(page)?page:0),Math.max(0,Math.ceil(Math.max(0,count)/REVIEW_PAGE_SIZE)-1));
}
export function savedReviewView(storage,userId) {
 try {
  const v=JSON.parse(storage?.getItem('mir-songbook-review-view:'+userId)||'null');
  return {open:v?.open===true,tab:REVIEW_TABS.includes(v?.tab)?v.tab:'pending',page:Number.isInteger(v?.page)&&v.page>=0&&v.page<10000?v.page:0,query:typeof v?.query==='string'?v.query.slice(0,200):''};
 } catch { return {open:false,tab:'pending',page:0,query:''}; }
}
export function saveReviewView(storage,userId,view) {
 if(!userId)return;
 try {storage?.setItem('mir-songbook-review-view:'+userId,JSON.stringify({open:view.open===true,tab:REVIEW_TABS.includes(view.tab)?view.tab:'pending',page:Math.max(0,view.page||0),query:typeof view.query==='string'?view.query.slice(0,200):''}));} catch { /* Session storage is optional. */ }
}
export function reviewNotice(title,decision) {
 return decision==='rejected'?`「${title||'해당 항목'}」을 확인 목록에서 삭제했습니다. 제외 기록은 보관됩니다.`:`「${title||'해당 항목'}」을 노래책에 반영했습니다.`;
}
