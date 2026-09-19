import PageHero from '../components/PageHero';
import { bandInfo, bandMembers } from '../data/siteData';
import '../band-page.css';

const BAND_PERFORMANCE_IMAGE = '/images/cheongwoon-band-performance.webp';
const DEFAULT_MEMBER_IMAGE = '/images/cheongwoon-member-default.webp';

export default function BandPage() {
  return (
    <>
      <PageHero eyebrow="ABOUT BAND" title="청운밴드" description="미르와 함께 무대의 사운드를 완성해 온 청운밴드를 소개합니다." />
      <section className="section-wrap band-intro">
        <div className="band-intro-copy">
          <span className="soft-label">CHEONGWOON BAND</span>
          <h2>{bandInfo.tagline}</h2>
        </div>
        <figure className="band-intro-visual">
          <img src={BAND_PERFORMANCE_IMAGE} alt="미르와 청운밴드가 함께 공연하는 모습" />
          <figcaption>
            <span>MIR × CHEONGWOON BAND</span>
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
