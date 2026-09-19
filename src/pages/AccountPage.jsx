import { useEffect, useMemo, useState } from 'react';
import { KeyRound, LogIn, LogOut, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHero from '../components/PageHero';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const normalizeUsername = (value) => value.trim().toLowerCase();
const validUsername = (value) => /^[a-z0-9_.-]{4,24}$/.test(value);
const validPassword = (value) => value.length >= 8 && value.length <= 128;

const authMessage = (code) => {
  if (code === 'email_not_confirmed') return '이메일 인증을 완료한 뒤 로그인해 주세요.';
  if (code === 'invalid_credentials') return '아이디/이메일 또는 비밀번호를 확인해 주세요.';
  return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
};

export default function AccountPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'recovery' ? 'reset' : 'login';
  const [mode, setMode] = useState(initialMode);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [login, setLogin] = useState({ identifier: '', password: '' });
  const [signup, setSignup] = useState({ username: '', email: '', password: '', passwordConfirm: '' });
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [recoveryAuthorized, setRecoveryAuthorized] = useState(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    return hash.get('type') === 'recovery';
  });
  const [message, setMessage] = useState(searchParams.get('verified') === '1' ? '이메일 인증이 완료되었습니다. 로그인해 주세요.' : '');
  const [busy, setBusy] = useState(false);

  const nextPath = useMemo(() => {
    const value = searchParams.get('next') || '';
    return value.startsWith('/') && !value.startsWith('//') ? value : '';
  }, [searchParams]);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;

    const loadProfile = async (nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (!nextSession?.user) {
        setProfile(null);
        return;
      }
      const { data } = await supabase
        .from('member_profiles')
        .select('username,email')
        .eq('user_id', nextSession.user.id)
        .maybeSingle();
      if (active) setProfile(data || null);
    };

    supabase.auth.getSession().then(({ data }) => loadProfile(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryAuthorized(true);
        setMode('reset');
        const next = new URLSearchParams(searchParams);
        next.set('mode', 'recovery');
        setSearchParams(next, { replace: true });
      }
      loadProfile(nextSession);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session && nextPath && mode !== 'reset') navigate(nextPath, { replace: true });
  }, [session, nextPath, mode, navigate]);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setMessage('');
    const next = new URLSearchParams(searchParams);
    next.delete('verified');
    if (nextMode === 'reset') next.set('mode', 'recovery');
    else next.delete('mode');
    setSearchParams(next, { replace: true });
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setMessage('');

    const { data, error } = await supabase.functions.invoke('member-auth', {
      body: {
        action: 'login',
        identifier: login.identifier.trim(),
        password: login.password,
      },
    });

    if (error || !data?.access_token || !data?.refresh_token) {
      setBusy(false);
      setMessage(authMessage(data?.error || 'invalid_credentials'));
      return;
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });

    setBusy(false);
    if (sessionError) {
      setMessage('로그인 세션을 생성하지 못했습니다. 다시 시도해 주세요.');
      return;
    }

    setMessage('로그인했습니다.');
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    if (!supabase || busy) return;

    const username = normalizeUsername(signup.username);
    const email = signup.email.trim().toLowerCase();

    if (!validUsername(username)) {
      setMessage('아이디는 영문 소문자, 숫자, _, -, . 조합으로 4~24자만 사용할 수 있습니다.');
      return;
    }
    if (!validPassword(signup.password)) {
      setMessage('비밀번호는 8~128자로 입력해 주세요.');
      return;
    }
    if (signup.password !== signup.passwordConfirm) {
      setMessage('비밀번호와 비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setBusy(true);
    setMessage('');

    const availability = await supabase.functions.invoke('member-auth', {
      body: { action: 'username-available', username },
    });

    if (availability.error) {
      setBusy(false);
      setMessage('아이디 중복 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    if (!availability.data?.available) {
      setBusy(false);
      setMessage('이미 사용 중인 아이디입니다.');
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password: signup.password,
      options: {
        data: { username },
        emailRedirectTo: `${window.location.origin}/account?verified=1`,
      },
    });

    setBusy(false);

    if (error) {
      setMessage(error.message?.includes('Database error') ? '이미 사용 중인 아이디 또는 이메일입니다.' : error.message);
      return;
    }

    if (data.session) {
      setMessage('회원가입과 로그인이 완료되었습니다.');
      return;
    }

    setSignup({ username: '', email: '', password: '', passwordConfirm: '' });
    setMessage('회원가입 요청이 완료되었습니다. 입력한 이메일로 전송된 인증 링크를 눌러 가입을 완료해 주세요.');
    setMode('login');
  };

  const handleRecovery = async (event) => {
    event.preventDefault();
    if (!supabase || busy) return;
    const email = recoveryEmail.trim().toLowerCase();
    setBusy(true);
    setMessage('');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/account?mode=recovery`,
    });

    setBusy(false);
    if (error) {
      setMessage('비밀번호 재설정 메일을 보내지 못했습니다. 이메일 주소와 인증 설정을 확인해 주세요.');
      return;
    }

    setMessage('가입된 이메일이라면 비밀번호 재설정 인증 메일이 전송됩니다. 메일의 링크를 통해서만 비밀번호를 변경할 수 있습니다.');
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    if (!supabase || busy || !recoveryAuthorized) return;
    if (!validPassword(newPassword)) {
      setMessage('새 비밀번호는 8~128자로 입력해 주세요.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setMessage('새 비밀번호와 새 비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setBusy(true);
    setMessage('');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);

    if (error) {
      setMessage('비밀번호 변경 권한을 확인하지 못했습니다. 이메일의 재설정 링크를 다시 열어 주세요.');
      return;
    }

    await supabase.auth.signOut();
    setNewPassword('');
    setNewPasswordConfirm('');
    switchMode('login');
    setMessage('비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.');
  };

  if (!isSupabaseConfigured) {
    return (
      <>
        <PageHero eyebrow="ACCOUNT" title="회원 계정" description="회원가입과 로그인을 관리합니다." />
        <section className="section-wrap"><div className="setup-banner">Supabase 연결이 필요합니다.</div></section>
      </>
    );
  }

  if (session && mode !== 'reset') {
    return (
      <>
        <PageHero eyebrow="ACCOUNT" title="내 정보" description="현재 로그인된 회원 정보를 확인합니다." />
        <section className="section-wrap account-auth-wrap">
          <div className="account-auth-card account-profile-card">
            <ShieldCheck size={34} />
            <h2>{profile?.username || '회원'}</h2>
            <p>{profile?.email || session.user.email}</p>
            <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}><LogOut size={17}/> 로그아웃</button>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHero
        eyebrow="ACCOUNT"
        title={mode === 'signup' ? '회원가입' : mode === 'forgot' ? '비밀번호 찾기' : mode === 'reset' ? '새 비밀번호 설정' : '회원 로그인'}
        description="아이디, 비밀번호, 이메일만으로 계정을 관리합니다."
      />
      <section className="section-wrap account-auth-wrap">
        {mode !== 'reset' && (
          <div className="account-auth-tabs">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>로그인</button>
            <button className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')}>회원가입</button>
            <button className={mode === 'forgot' ? 'active' : ''} onClick={() => switchMode('forgot')}>비밀번호 찾기</button>
          </div>
        )}

        {mode === 'login' && (
          <form className="account-auth-card" onSubmit={handleLogin}>
            <div className="account-auth-title"><LogIn size={20}/><strong>로그인</strong></div>
            <label>아이디 또는 이메일<input value={login.identifier} onChange={(e) => setLogin({ ...login, identifier: e.target.value })} autoComplete="username" required /></label>
            <label>비밀번호<input type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} autoComplete="current-password" required /></label>
            <button className="btn btn-primary" disabled={busy}>{busy ? '로그인 중...' : '로그인'}</button>
          </form>
        )}

        {mode === 'signup' && (
          <form className="account-auth-card" onSubmit={handleSignup}>
            <div className="account-auth-title"><UserPlus size={20}/><strong>회원가입</strong></div>
            <label>아이디<input value={signup.username} onChange={(e) => setSignup({ ...signup, username: e.target.value })} autoComplete="username" placeholder="영문 소문자, 숫자, _, -, ." minLength="4" maxLength="24" required /></label>
            <label>비밀번호<input type="password" value={signup.password} onChange={(e) => setSignup({ ...signup, password: e.target.value })} autoComplete="new-password" minLength="8" maxLength="128" required /></label>
            <label>비밀번호 확인<input type="password" value={signup.passwordConfirm} onChange={(e) => setSignup({ ...signup, passwordConfirm: e.target.value })} autoComplete="new-password" minLength="8" maxLength="128" required /></label>
            <label>이메일<input type="email" value={signup.email} onChange={(e) => setSignup({ ...signup, email: e.target.value })} autoComplete="email" required /></label>
            <button className="btn btn-primary" disabled={busy}>{busy ? '가입 처리 중...' : '회원가입'}</button>
          </form>
        )}

        {mode === 'forgot' && (
          <form className="account-auth-card" onSubmit={handleRecovery}>
            <div className="account-auth-title"><Mail size={20}/><strong>이메일 인증으로 비밀번호 찾기</strong></div>
            <p className="account-auth-note">등록한 이메일로 전송되는 인증 링크를 통해서만 새 비밀번호를 설정할 수 있습니다.</p>
            <label>가입 이메일<input type="email" value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} autoComplete="email" required /></label>
            <button className="btn btn-primary" disabled={busy}>{busy ? '전송 중...' : '재설정 메일 보내기'}</button>
          </form>
        )}

        {mode === 'reset' && (
          recoveryAuthorized ? (
            <form className="account-auth-card" onSubmit={handleResetPassword}>
              <div className="account-auth-title"><KeyRound size={20}/><strong>새 비밀번호 설정</strong></div>
              <p className="account-auth-note">이메일 인증 링크가 확인되었습니다. 새 비밀번호를 설정해 주세요.</p>
              <label>새 비밀번호<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength="8" maxLength="128" required /></label>
              <label>새 비밀번호 확인<input type="password" value={newPasswordConfirm} onChange={(e) => setNewPasswordConfirm(e.target.value)} autoComplete="new-password" minLength="8" maxLength="128" required /></label>
              <button className="btn btn-primary" disabled={busy}>{busy ? '변경 중...' : '비밀번호 변경'}</button>
            </form>
          ) : (
            <div className="account-auth-card">
              <div className="account-auth-title"><KeyRound size={20}/><strong>이메일 인증 필요</strong></div>
              <p className="account-auth-note">비밀번호는 등록 이메일로 받은 재설정 링크를 통해서만 변경할 수 있습니다. 비밀번호 찾기에서 인증 메일을 다시 요청해 주세요.</p>
              <button type="button" className="btn btn-primary" onClick={() => switchMode('forgot')}>비밀번호 찾기로 이동</button>
            </div>
          )
        )}

        {message && <div className="account-auth-message">{message}</div>}
      </section>
    </>
  );
}
