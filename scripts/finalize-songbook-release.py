#!/usr/bin/env python3
"""One-time, assertion-guarded integration of the reviewed ID-login release."""
from pathlib import Path

def replace_once(text, old, new):
    assert text.count(old) == 1, old
    return text.replace(old, new, 1)

p=Path('src/pages/SongbookV2Page.jsx');s=p.read_text();s="import {loginWithUsername} from '../lib/usernameLogin';\n"+s
start=s.index('function LoginPanel(');end=s.index('\nfunction AccessPanel(',start)
assert 'signInWithPassword({email,password})' in s[start:end]
s=s[:start]+'''function LoginPanel({store,close}) {
 const [identifier,setIdentifier]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const lock=useRef(false);
 async function submit(event) {
  event.preventDefault(); if(lock.current)return; lock.current=true;setBusy(true);setError('');
  try {await loginWithUsername(store.client,identifier,password);setPassword('');close();}
  catch(err){setError(err.message);}
  finally{lock.current=false;setBusy(false);}
 }
 return <Modal title="노래책 편집 로그인" close={close}>
  <p className="sb-note">기존 사이트의 아이디와 비밀번호로 로그인합니다. 미르님 계정은 관리자 지정 후 숙련도를 저장할 수 있습니다.</p>
  <form className="sb2-form" onSubmit={submit}>
   <label>아이디<input name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={24} required value={identifier} onChange={e=>setIdentifier(e.target.value)} disabled={busy}/></label>
   <label>비밀번호<input name="password" type="password" autoComplete="current-password" maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></label>
   {error&&<p role="alert">{error}</p>}
   <button className="sb-button sb-primary" disabled={busy}>{busy?'로그인 중…':'로그인'}</button>
  </form>
 </Modal>;
}'''+s[end:]
s=replace_once(s,'<b>4차 검토안</b>',"{IS_SONGBOOK_PREVIEW && <b>4차 검토안</b>}")
s=replace_once(s,'<Link to="/songbook/review">4차 변경점 보기 ↗</Link>','{IS_SONGBOOK_PREVIEW && <Link to="/songbook/review">4차 변경점 보기 ↗</Link>}')
s=replace_once(s,"try{await store.client.auth.signOut({scope:'local'});}","try{const result=await store.client.auth.signOut({scope:'local'});if(result.error)throw result.error;}")
p.write_text(s)
p=Path('src/pages/AccountPage.jsx');s=p.read_text();s="import { loginWithUsername } from '../lib/usernameLogin';\n"+s
start=s.index("    const { data, error } = await supabase.functions.invoke('member-auth',",s.index('  const handleLogin'))
end=s.index('\n  const handleSignup',start)
s=s[:start]+'''    try {
      await loginWithUsername(supabase, login.identifier, login.password);
      setLogin(previous => ({ ...previous, password: '' }));
      setMessage('로그인했습니다.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };
'''+s[end:]
s=replace_once(s,'아이디 또는 이메일<input','아이디<input').replace('아이디/이메일 또는 비밀번호','아이디 또는 비밀번호')
s=replace_once(s,'autoComplete="username" required /></label>','type="text" name="username" autoCapitalize="none" spellCheck={false} maxLength={24} autoComplete="username" required /></label>')
p.write_text(s)
p=Path('src/lib/songbookStore.js');s=p.read_text();s="import { supabase } from './supabase';\nimport { IS_REVIEW_PREVIEW, IS_SONGBOOK_PREVIEW } from './preview';\nimport { songbookTables } from './usernameLogin';\n"+s
s=replace_once(s,'export const songbookClient = url && key ? createClient','export const songbookClient = !IS_REVIEW_PREVIEW ? supabase : IS_SONGBOOK_PREVIEW && url && key ? createClient')
s=replace_once(s,"const tables = { entries: 'songbook_preview_entries', ratings: 'songbook_preview_ratings' };",'const tables = songbookTables(IS_SONGBOOK_PREVIEW);')
assert s.count(".from('songbook_preview_editors')")==2
s=s.replace(".from('songbook_preview_editors')",'.from(tables.editors)')
s=replace_once(s,'const canEdit = ready && (demo || admin || Boolean(role));','const canEdit = ready && (!IS_REVIEW_PREVIEW || IS_SONGBOOK_PREVIEW) && (demo || admin || Boolean(role));')
s=replace_once(s,"const canRate = ready && (demo || role === 'owner');","const canRate = ready && (!IS_REVIEW_PREVIEW || IS_SONGBOOK_PREVIEW) && (demo || role === 'owner');")
p.write_text(s)
p=Path('src/lib/songbookV2.js');s=p.read_text();s=replace_once(s,'return (input,init={})=>{let u;','return async (input,init={})=>{let u;')
s=replace_once(s,'const allowedTable=table&&',"let memberLogin=false;if(path==='/functions/v1/member-auth'&&method==='POST'){try{const raw=init.body??(input instanceof Request?await input.clone().text():'');const b=JSON.parse(raw);memberLogin=b.action==='login'&&typeof b.identifier==='string'&&/^[a-z0-9_.-]{4,24}$/i.test(b.identifier)&&typeof b.password==='string'&&b.password.length>0&&b.password.length<=128&&Object.keys(b).every(k=>['action','identifier','password'].includes(k));}catch{}}const allowedTable=table&&")
s=replace_once(s,'!(auth||allowedTable)','!(auth||allowedTable||memberLogin)');p.write_text(s)
p=Path('src/App.jsx');s=p.read_text();s=replace_once(s,'import { IS_REVIEW_PREVIEW }','import { IS_REVIEW_PREVIEW, IS_SONGBOOK_PREVIEW }')
s=replace_once(s,'<Route path="/songbook/review" element={<Suspense fallback={songbookFallback}><SongbookReviewPage /></Suspense>} />','<Route path="/songbook/review" element={IS_SONGBOOK_PREVIEW ? <Suspense fallback={songbookFallback}><SongbookReviewPage /></Suspense> : <Navigate to="/songbook" replace />} />');p.write_text(s)
