// One-time integration edits are committed by the preview snapshot job before validation.
import { readFile, writeFile } from 'node:fs/promises';
const replace = async (path, pairs) => {
  let text = await readFile(path, 'utf8');
  for (const [from, to] of pairs) text = text.replaceAll(from, to);
  await writeFile(path, text);
};
await replace('src/pages/SongbookV2Page.jsx', [
  ['로그아웃</button>}</div></section>', '로그아웃</button></>}</div></section>'],
  ["[category,setCategory]=useState('');const request=useRef(null);", "[category,setCategory]=useState(''),[aliasText,setAliasText]=useState((song?.aliases||[]).join(', '));const request=useRef(null);"],
  ["onClick={()=>setDraft({...s})}", "onClick={()=>{setDraft({...s});setAliasText(s.aliases.join(', '));}}"],
  ["setDraft(found?{...found}:{...draft,id:undefined,title:r.title,artist:r.artist});setResults([]);", "setDraft(found?{...found}:{...draft,id:undefined,title:r.title,artist:r.artist});setAliasText(found?.aliases.join(', ')||'');setResults([]);"],
  ["await store.saveSong(draft)", "await store.saveSong({...draft,aliases:aliasText.split(',').map(v=>v.trim()).filter(Boolean)})"],
  ["value={draft.aliases.join(', ')} onChange={e=>setDraft({...draft,aliases:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})}", "value={aliasText} onChange={e=>setAliasText(e.target.value)}"],
]);
await replace('scripts/songbook-v2-browser-check.py', [
  ["d.get_by_role('button',name='난이도 2점으로 설정',exact=True).click();", "d.get_by_label('연결 영상 · 한 줄에 한 주소',exact=True).fill('https://www.youtube.com/watch?v=abcdefghijk');d.get_by_label('신청 가능 상태',exact=True).select_option('available');d.get_by_role('button',name='난이도 2점으로 설정',exact=True).click();"],
  ["page.reload(wait_until='networkidle');expect(page.get_by_role('dialog').get_by_role('heading',name='검토용 새 노래',exact=True)).to_be_visible();page.keyboard.press('Escape');", "page.reload(wait_until='networkidle');expect(page.get_by_role('dialog').get_by_role('heading',name='검토용 새 노래',exact=True)).to_be_visible();expect(page.get_by_role('dialog').get_by_role('link',name='영상 1 새 탭에서 보기 ↗',exact=True)).to_have_attribute('href','https://www.youtube.com/watch?v=abcdefghijk');assert '신청 가능 상태: 가능' in page.get_by_role('dialog').inner_text();page.keyboard.press('Escape');"],
]);
