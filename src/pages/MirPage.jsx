import { Radio, Sparkles } from 'lucide-react';
import PageHero from '../components/PageHero';
import EmptyVisual from '../components/EmptyVisual';
import { mirProfile } from '../data/siteData';

export default function MirPage() {
  return (
    <>
      <PageHero eyebrow="ABOUT MIR" title="미르" description="방송에서 무대까지, 미르님의 이야기를 소개합니다." />
      <section className="section-wrap profile-layout">
        <div className="profile-photo-wrap">
          <EmptyVisual label="미르 프로필 이미지" className="portrait-visual" />
          <div className="photo-caption"><Radio size={16}/> LIVE ON SOOP</div>
        </div>
        <div className="profile-copy">
          <span className="soft-label">{mirProfile.role}</span>
          <h2>{mirProfile.tagline}</h2>
          <p>{mirProfile.description}</p>
          <div className="tag-row">{mirProfile.highlights.map((item) => <span key={item}>#{item}</span>)}</div>
          <div className="quote-card"><Sparkles size={19}/><p>실제 미르님의 인사말 또는 팬들에게 전하는 메시지를 이곳에 넣을 수 있습니다.</p></div>
        </div>
      </section>
    </>
  );
}
