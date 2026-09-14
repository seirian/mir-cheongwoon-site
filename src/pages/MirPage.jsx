import { useEffect, useState } from 'react';
import { Radio, Sparkles } from 'lucide-react';
import PageHero from '../components/PageHero';
import mirProfileImage from '../assets/mirProfileData';
import { mirProfile } from '../data/siteData';

const MIR_PROFILE_IMAGE = mirProfileImage;
const MIR_SOOP_URL = 'https://play.sooplive.com/alice427';
const LIVE_CHECK_INTERVAL = 60_000;

export default function MirPage() {
  const [liveStatus, setLiveStatus] = useState('unknown');
  const [liveInfo, setLiveInfo] = useState(null);

  useEffect(() => {
    let active = true;

    const checkLiveStatus = async () => {
      try {
        const response = await fetch('/.netlify/functions/soop-live', {
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
      <PageHero eyebrow="ABOUT MIR" title="미르" description="방송에서 무대까지, 미르님의 이야기를 소개합니다." />
      <section className="section-wrap profile-layout">
        <div className={`profile-photo-wrap${isLive ? ' is-live' : ''}`}>
          <img className="mir-profile-image" src={MIR_PROFILE_IMAGE} alt="버추얼 스트리머 미르 프로필" />
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
    </>
  );
}
