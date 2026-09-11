import PageHero from '../components/PageHero';
import EmptyVisual from '../components/EmptyVisual';
import { bandInfo, bandMembers } from '../data/siteData';

export default function BandPage() {
  return (
    <>
      <PageHero eyebrow="ABOUT BAND" title="청운밴드" description="미르와 함께 무대의 사운드를 완성해 온 청운밴드를 소개합니다." />
      <section className="section-wrap band-intro">
        <div><span className="soft-label">CHEONGWOON BAND</span><h2>{bandInfo.tagline}</h2></div>
        <p>{bandInfo.description}</p>
      </section>
      <section className="section-wrap member-section">
        <div className="section-title"><span>MEMBERS</span><h2>밴드 멤버</h2><p>사진, 포지션, 한 줄 코멘트로 각 멤버를 소개합니다.</p></div>
        <div className="member-grid">
          {bandMembers.map((member) => (
            <article className="member-card" key={member.id}>
              {member.image ? <img src={member.image} alt={member.name} /> : <EmptyVisual label="멤버 사진" className="member-visual" />}
              <div className="member-copy"><span>{member.position}</span><h3>{member.name}</h3><p>{member.comment}</p></div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
