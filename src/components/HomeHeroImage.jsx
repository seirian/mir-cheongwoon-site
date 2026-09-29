import { useEffect, useRef, useState } from 'react';
import { ImagePlus, LogIn, LogOut, Upload, X } from 'lucide-react';
import { heroClient } from '../lib/heroClient';
import { IS_REVIEW_PREVIEW } from '../lib/preview';
import { hasHeroAdminAccess, prepareHeroImage, readHeroImage, saveHeroImage } from '../lib/heroImage';

const FALLBACK = `${import.meta.env.BASE_URL}mir-profile-still.webp`;

export default function HomeHeroImage() {
  const [image, setImage] = useState(FALLBACK);
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(Boolean(heroClient));
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [chosen, setChosen] = useState(null);
  const [chosenUrl, setChosenUrl] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const dialog = useRef(null);
  const uploadInput = useRef(null);
  const selectionVersion = useRef(0);

  useEffect(() => {
    let active = true;
    readHeroImage(heroClient, IS_REVIEW_PREVIEW).then((url) => { if (active && url) setImage(url); }).catch(() => { /* Keep the bundled image on metadata outages. */ });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!heroClient) return undefined;
    let active = true;
    let version = 0;
    const resolveSession = async (nextSession) => {
      const current = ++version;
      if (!active) return;
      setSession(nextSession);
      setIsAdmin(false);
      setChecking(Boolean(nextSession?.user));
      if (!nextSession?.user) return;
      let allowed = false;
      try { allowed = await hasHeroAdminAccess(heroClient); } catch { /* Fail closed. */ }
      if (active && current === version) { setIsAdmin(allowed); setChecking(false); }
    };
    heroClient.auth.getSession().then(({ data }) => resolveSession(data.session)).catch(() => { if (active) setChecking(false); });
    // Do not await Supabase calls from inside its auth callback lock.
    const { data: listener } = heroClient.auth.onAuthStateChange((_event, nextSession) => { setTimeout(() => { if (active) resolveSession(nextSession); }, 0); });
    return () => { active = false; version += 1; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => () => { if (chosenUrl) URL.revokeObjectURL(chosenUrl); }, [chosenUrl]);

  function clearSelection() {
    selectionVersion.current += 1;
    setChosen(null); setChosenUrl(''); setPreparing(false); setPassword(''); setError('');
    if (uploadInput.current) uploadInput.current.value = '';
  }

  async function login(event) {
    event.preventDefault();
    if (!heroClient || busy) return;
    setBusy(true); setError('');
    try {
      const result = await heroClient.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw new Error('관리자 이메일과 비밀번호를 확인해 주세요.');
      setSession(result.data.session);
      setIsAdmin(await hasHeroAdminAccess(heroClient));
    } catch (cause) { setError(cause.message || '로그인에 실패했습니다.'); }
    finally { setPassword(''); setBusy(false); }
  }

  async function chooseFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const version = ++selectionVersion.current;
    setChosen(null); setChosenUrl(''); setPreparing(true); setError('');
    try {
      const blob = await prepareHeroImage(file);
      if (version !== selectionVersion.current) return;
      setChosen(blob); setChosenUrl(URL.createObjectURL(blob));
    } catch (cause) { if (version === selectionVersion.current) setError(cause.message); }
    finally { if (version === selectionVersion.current) setPreparing(false); }
  }

  async function save(event) {
    event.preventDefault();
    if (!chosen || busy || !isAdmin) return;
    setBusy(true); setError('');
    try {
      const url = await saveHeroImage(heroClient, chosen, IS_REVIEW_PREVIEW);
      setImage(url);
      setNotice(IS_REVIEW_PREVIEW ? '검토용 홈 이미지를 저장했습니다. 운영 이미지는 바뀌지 않습니다.' : '홈 이미지를 저장했습니다.');
      dialog.current.close();
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true); setError('');
    try {
      const { error: logoutError } = await heroClient.auth.signOut({ scope: 'local' });
      if (logoutError) throw logoutError;
      setSession(null); setIsAdmin(false); clearSelection();
    } catch { setError('로그아웃에 실패했습니다. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }

  return <figure className="promo-hero-art">
    <span className="promo-art-word" aria-hidden="true">MIR</span><div className="promo-art-ring" aria-hidden="true"/>
    <img className="promo-mir-portrait" src={image} alt="청룡 버튜버 미르 캐릭터" width="548" height="574" fetchPriority="high" decoding="async" onError={() => setImage(FALLBACK)}/>
    <figcaption><span>VIRTUAL VOICE. LIVE SOUND.</span><strong>미르 <b>×</b> 청운밴드</strong><small>노래로 만나, 무대로 이어지는 이야기</small></figcaption>
    <span className="promo-art-index" aria-hidden="true">MIR / CHEONGWOON<br/>FAN ARCHIVE</span>
    {(isAdmin || IS_REVIEW_PREVIEW) && <button className="hero-image-manage" type="button" onClick={() => { setError(''); dialog.current.showModal(); }}><ImagePlus size={16}/>{isAdmin ? '홈 이미지 교체' : '관리자 이미지 관리'}</button>}
    {notice && <p className="hero-image-feedback" role="status">{notice}</p>}
    <dialog className="hero-image-dialog" ref={dialog} aria-labelledby="hero-image-title" onClose={clearSelection} onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <div className="hero-dialog-heading"><div><span className="eyebrow">HOME IMAGE</span><h2 id="hero-image-title">홈 이미지 관리</h2></div><button className="hero-dialog-close" type="button" aria-label="이미지 관리 닫기" disabled={busy} onClick={() => dialog.current.close()}><X size={22}/></button></div>
      <p className="hero-dialog-scope">{IS_REVIEW_PREVIEW ? '검토용 이미지에만 적용됩니다. 운영 사이트의 이미지는 변경하지 않습니다.' : '저장하면 모든 방문자에게 새 홈 이미지가 표시됩니다.'}</p>
      {!heroClient ? <p role="alert">서비스 연결 설정을 확인해 주세요.</p> : checking ? <p role="status">관리자 권한을 확인하는 중…</p> : !session ? <form className="hero-image-form" onSubmit={login}>
        <p>기존 관리자 계정의 이메일로 로그인해 주세요. 일반 회원은 이미지를 변경할 수 없습니다.</p>
        <label>관리자 이메일<input type="email" name="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy}/></label>
        <label>비밀번호<input type="password" name="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy}/></label>
        <button className="btn promo-primary" type="submit" disabled={busy}><LogIn size={16}/>{busy ? '로그인 중…' : '관리자 로그인'}</button>
      </form> : !isAdmin ? <div><p role="status">이 계정에는 관리자 권한이 없습니다. 이미지 업로드는 관리자만 가능합니다.</p><button type="button" className="btn btn-ghost" disabled={busy} onClick={logout}>다른 계정으로 로그인</button></div> : <form className="hero-image-form" onSubmit={save}>
        <div className="hero-upload-preview"><img src={chosenUrl || image} alt={chosenUrl ? '저장 전 선택 이미지 미리보기' : '현재 홈 이미지'}/></div>
        <label>새 홈 이미지<input ref={uploadInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} disabled={busy || preparing}/></label>
        <small>JPG · PNG · WebP, 최대 5MB. 긴 변 1,600px 이하의 정지 WebP로 최적화합니다. 사용 권한이 있는 이미지만 올려 주세요.</small>
        {preparing && <p role="status">이미지를 확인하고 최적화하는 중…</p>}
        <div className="hero-dialog-actions"><button className="btn promo-primary" type="submit" disabled={!chosen || busy || preparing}><Upload size={16}/>{busy ? '저장 중…' : '이미지 저장'}</button><button className="btn btn-ghost" type="button" disabled={busy} onClick={() => dialog.current.close()}>취소</button>{IS_REVIEW_PREVIEW && <button className="btn btn-ghost" type="button" disabled={busy} onClick={logout}><LogOut size={16}/>검토 로그인 종료</button>}</div>
      </form>}
      {error && <p className="hero-upload-error" role="alert">{error}</p>}
    </dialog>
  </figure>;
}
