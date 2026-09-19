import { useState } from 'react';
import PageHero from '../components/PageHero';
import { bandInfo, bandMembers } from '../data/siteData';
import '../band-page.css';

const PUBLIC_BASE = import.meta.env.BASE_URL || '/';
const FALLBACK_BAND_IMAGE = `${PUBLIC_BASE}images/cheongwoon-band-performance.webp`;
const DEFAULT_MEMBER_IMAGE = `${PUBLIC_BASE}images/cheongwoon-member-default.webp`;
const BAND_TAGLINE_HIGHLIGHT = '미르와 함께 여름을 노래하는 동료';

const BAND_HERO_VISUALS = [
  {
    src: 'https://images.pexels.com/photos/18271795/pexels-photo-18271795.jpeg?auto=compress&cs=tinysrgb&w=1800',
    alt: '여성 보컬이 무대 조명 아래 노래하는 라이브 공연 이미지',
    label: 'VOCAL · LIVE',
    objectPosition: '50% 42%',
  },
  {
    src: 'https://images.pexels.com/photos/7715664/pexels-photo-7715664.jpeg?auto=compress&cs=tinysrgb&w=1800',
    alt: '남성 드러머가 콘서트 무대에서 연주하는 라이브 공연 이미지',
    label: 'DRUMS · LIVE',
    objectPosition: '50% 48%',
  },
  {
    src: 'https://images.pexels.com/photos/28978302/pexels-photo-28978302.jpeg?auto=compress&cs=tinysrgb&w=1800',
    alt: '여성 베이시스트가 무대에서 연주하는 라이브 공연 이미지',
    label: 'BASS · LIVE',
    objectPosition: '50% 45%',
  },
  {
    src: 'https://images.pexels.com/photos/8044067/pexels-photo-8044067.jpeg?auto=compress&cs=tinysrgb&w=1800',
    alt: '여성 보컬과 밴드가 함께 공연하는 라이브 무대 이미지',
    label: 'BAND · LIVE',
    objectPosition: '50% 50%',
  },
];

export default function BandPage() {
  const [heroVisual] = useState(
    () => BAND_HERO_VISUALS[Math.floor(Math.random() * BAND_HERO_VISUALS.length)],
  );
  const [taglineBefore, taglineAfter] = bandInfo.tagline.split(BAND_TAGLINE_HIGHLIGHT);

  const handleHeroImageError = (event) => {
    if (event.currentTarget.dataset.fallbackApplied === 'true') return;
    event.currentTarget.dataset.fallbackApplied = 'true';
    event.currentTarget.src = FALLBACK_BAND_IMAGE;
    event.currentTarget.style.objectPosition = 'center';
  };

  return (
    <>
      <PageHero eyebrow="ABOUT BAND" title="청운밴드" description="미르와 함께 무대의 사운드를 완성해 온 청운밴드를 소개합니다." />
      <section className="section-wrap band-intro">
        <div className="band-intro-copy">
          <span className="soft-label">CHEONGWOON BAND</span>
          <h2>
            {taglineBefore}
            <strong>{BAND_TAGLINE_HIGHLIGHT}</strong>
            {taglineAfter}
          </h2>
        </div>
        <figure className="band-intro-visual">
          <img
            src={heroVisual.src}
            alt={heroVisual.alt}
            style={{ objectPosition: heroVisual.objectPosition }}
            onError={handleHeroImageError}
            decoding="async"
            referrerPolicy="no-referrer"
          />
          <figcaption>
            <span>{heroVisual.label}</span>
            <strong>함께 여름을 노래하는 무대</strong>
          </figcaption>
        </figure>
      </section>
      <section className="section-wrap member-section">
        <div className="section-title"><span>MEMBERS</span><h2>밴드 멤버</h2><p>사진, 포지션, 한 줄 코멘트로 각 멤버를 소개합니다.</p></div>
        <div className="member-grid">
          {bandMembers.map((member) => (
            <article className="member-card" key={member.id}>
              <div className={`member-photo-wrap${member.image ? '' : ' is-default'}`}>
                <img
                  className="member-photo"
                  src={member.image || DEFAULT_MEMBER_IMAGE}
                  alt={member.image ? member.name : `${member.name} 기본 밴드 프로필 이미지`}
                  loading="lazy"
                />
                {!member.image && <span className="member-photo-badge">CHEONGWOON BAND</span>}
              </div>
              <div className="member-copy"><span>{member.position}</span><h3>{member.name}</h3><p>{member.comment}</p></div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
