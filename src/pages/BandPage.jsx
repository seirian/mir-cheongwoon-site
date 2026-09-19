import { useMemo } from 'react';
import PageHero from '../components/PageHero';
import { bandInfo, bandMembers } from '../data/siteData';
import CHEONGWOON_HERO_IMAGE from '../data/cheongwoonHeroImage';
import { BAND_MEMBER_ILLUSTRATIONS } from '../data/bandMemberIllustrations';
import '../band-page.css';

const PUBLIC_BASE = import.meta.env.BASE_URL || '/';
const DEFAULT_MEMBER_IMAGE = `${PUBLIC_BASE}images/cheongwoon-member-default.webp`;
const BAND_TAGLINE_HIGHLIGHT = '미르와 함께 여름을 노래하는 동료';

function shuffleIllustrations(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export default function BandPage() {
  const [taglineBefore, taglineAfter] = bandInfo.tagline.split(BAND_TAGLINE_HIGHLIGHT);

  const memberVisuals = useMemo(() => {
    const shuffled = shuffleIllustrations(BAND_MEMBER_ILLUSTRATIONS);
    return bandMembers.map((member, index) => member.image || shuffled[index % shuffled.length]);
  }, []);

  const handleMemberImageError = (event) => {
    if (event.currentTarget.dataset.fallbackApplied === 'true') return;
    event.currentTarget.dataset.fallbackApplied = 'true';
    event.currentTarget.src = DEFAULT_MEMBER_IMAGE;
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
            src={CHEONGWOON_HERO_IMAGE}
            alt="청운밴드 대표 일러스트"
            decoding="async"
          />
        </figure>
      </section>
      <section className="section-wrap member-section">
        <div className="section-title"><span>MEMBERS</span><h2>밴드 멤버</h2><p>사진, 포지션, 한 줄 코멘트로 각 멤버를 소개합니다.</p></div>
        <div className="member-grid">
          {bandMembers.map((member, index) => (
            <article className="member-card" key={member.id}>
              <div className={`member-photo-wrap${member.image ? '' : ' is-illustration'}`}>
                <img
                  className="member-photo"
                  src={memberVisuals[index]}
                  alt={member.image ? member.name : `${member.name} 밴드 멤버 일러스트`}
                  loading="lazy"
                  onError={handleMemberImageError}
                />
              </div>
              <div className="member-copy"><span>{member.position}</span><h3>{member.name}</h3><p>{member.comment}</p></div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
