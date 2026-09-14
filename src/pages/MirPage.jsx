import { Radio, Sparkles } from 'lucide-react';
import PageHero from '../components/PageHero';
import { mirProfile } from '../data/siteData';

const MIR_PROFILE_IMAGE = 'https://i.namu.wiki/i/AWJzDHVawT3NOixrIFVPVnLo0GowaVHBThdOQ8vm8BQOBiBDpy71II4UW5_WzUaGZ7IVpbKz_Pq-D0Y3-_yiAwAWLJXdR_b-JhqBIU5XvWsroDNPJOT12lnr_z_QpnJVaRgBsFXd2Yvr95YhiMVemQ.webp';

export default function MirPage() {
  return (
    <>
      <PageHero eyebrow="ABOUT MIR" title="미르" description="방송에서 무대까지, 미르님의 이야기를 소개합니다." />
      <section className="section-wrap profile-layout">
        <div className="profile-photo-wrap">
          <img className="mir-profile-image" src={MIR_PROFILE_IMAGE} alt="버추얼 스트리머 미르 프로필" />
          <div className="photo-caption"><Radio size={16}/> LIVE ON SOOP</div>
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
