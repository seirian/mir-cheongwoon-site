import { useEffect, useState } from 'react';
import { Radio, Sparkles } from 'lucide-react';
import PageHero from '../components/PageHero';
import { mirProfile } from '../data/siteData';

const MIR_PROFILE_IMAGE = import.meta.env.BASE_URL + 'mir-profile-live.gif';
const MIR_SOOP_URL = 'https://play.sooplive.com/alice427';
const LIVE_CHECK_INTERVAL = 60_000;

function ChannelBrandMark({ label }) {
  if (label === 'YouTube') {
    return <svg viewBox="0 0 64 48" focusable="false"><rect x="4" y="8" width="56" height="32" rx="10"/><path d="M27 17.5 42 24 27 30.5Z" className="channel-brand-cutout"/></svg>;
  }
  if (label === 'X') {
    return <svg viewBox="0 0 64 64" focusable="false"><path d="M15 13 50 51M49 13 15 51"/></svg>;
  }
  if (label === '커뮤니티') {
    return <span className="channel-brand-naver"><b>N</b><small>cafe</small></span>;
  }
  return <span className="channel-brand-soop">SOOP</span>;
}

export default function MirPage() {
  const [liveStatus, setLiveStatus] = useState('unknown');
  const [liveInfo, setLiveInfo] = useState(null);

  useEffect(() => {
    let active = true;

    const checkLiveStatus = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(import.meta.env.BASE_URL + 'api/soop-live.php', {
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`Live status request failed: ${response.status}`);
        }

        const data = await response.json();
        if (!active) return;

        if (['live', 'offline', 'unknown'].includes(data.status)) {
          setLiveStatus(data.status);
          setLiveInfo(data.status === 'live' ? data : null);
        } else {
          setLiveStatus('unknown');
          setLiveInfo(null);
        }
      } catch {
        if (active) {
          setLiveStatus('unknown');
          setLiveInfo(null);
        }
      }
    };

    checkLiveStatus();
    const timer = window.setInterval(checkLiveStatus, LIVE_CHECK_INTERVAL);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const isLive = liveStatus === 'live';
  const statusLabel = isLive
    ? 'LIVE ON SOOP'
    : liveStatus === 'offline'
      ? 'SOOP OFFLINE'
      : 'SOOP';
  const statusDescription = isLive
    ? `미르가 현재 SOOP에서 방송 중입니다${liveInfo?.title ? `: ${liveInfo.title}` : ''}`
    : liveStatus === 'offline'
      ? '미르는 현재 SOOP에서 방송 중이 아닙니다.'
      : 'SOOP 방송 상태를 확인할 수 없습니다.';

  return (
    <>
      <PageHero eyebrow="ABOUT MIR" title="미르(MIR)" description="방송에서 무대까지, 미르님의 이야기를 소개합니다." />
      <section className="section-wrap profile-layout">
        <div className={`profile-photo-wrap${isLive ? ' is-live' : ''}`}>
          <img
            className="mir-profile-image"
            src={MIR_PROFILE_IMAGE}
            alt="버추얼 스트리머 미르 프로필"
            width="548"
            height="574"
            loading="eager"
            decoding="async"
          />
          <a
            className={`photo-caption soop-status${isLive ? ' is-live' : ''}`}
            href={liveInfo?.watchUrl || MIR_SOOP_URL}
            target="_blank"
            rel="noreferrer"
            aria-label={statusDescription}
            title={statusDescription}
          >
            <span className="live-signal" aria-hidden="true"><Radio size={16}/></span>
            <span aria-live="polite">{statusLabel}</span>
          </a>
        </div>
        <div className="profile-copy">
          <span className="soft-label">{mirProfile.role}</span>
          <h2>{mirProfile.tagline}</h2>
          <p>{mirProfile.description}</p>
          <div className="tag-row">{mirProfile.highlights.map((item) => <span key={item}>#{item}</span>)}</div>
          <div className="quote-card"><Sparkles size={19}/><p>여러분과 함께라면, 저는 최강입니다!</p></div>
        </div>
      </section>

      <section className="section-wrap mir-intro-section">
        <div className="mir-intro-heading">
          <div>
            <span className="eyebrow">WHO IS MIR?</span>
            <p>프로필과 활동 채널을 한눈에 정리했습니다.</p>
          </div>
        </div>
        <div className="mir-profile-panel">
          <div className="mir-facts-grid">
            {mirProfile.profileFacts.map((item) => (
              <div className="mir-fact-row" key={item.label}>
                <span>{item.label}</span>
                <div>
                  <strong>{item.value}</strong>
                  {item.note && <small>{item.note}</small>}
                </div>
              </div>
            ))}
          </div>
          <aside className="mir-profile-aside">
            <div className="mir-intro-copy">
              {mirProfile.intro.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
            <div className="mir-channel-list">
              {mirProfile.channels.map((item) => (
                <a className="mir-channel-card" data-channel={item.label} key={item.label} href={item.url} target="_blank" rel="noreferrer">
                  <span className="mir-channel-copy">
                    <span className="mir-channel-label">{item.label}</span>
                    <strong>{item.name}</strong>
                    <em>바로가기 ↗</em>
                  </span>
                  <span className="mir-channel-mark" aria-hidden="true"><ChannelBrandMark label={item.label} /></span>
                </a>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
