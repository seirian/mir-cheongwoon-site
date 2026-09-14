import { ArrowRight, CalendarDays, Music2, PlaySquare, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <>
      <section className="home-hero">
        <div className="hero-glow hero-glow-one" />
        <div className="hero-glow hero-glow-two" />
        <div className="home-hero-content">
          <span className="eyebrow"><Sparkles size={15} /> MIR × CHEONGWOON BAND</span>
          <h1>목소리와 연주가 만나<br /><em>하나의 무대</em>가 되는 순간</h1>
          <p>미르와 청운밴드가 함께 만든 공연, 음악, 그리고 기억을 한곳에 기록합니다.</p>
          <div className="hero-actions">
            <Link to="/history" className="btn btn-primary">공연 이력 보기 <ArrowRight size={17} /></Link>
            <Link to="/gallery" className="btn btn-ghost">영상 및 갤러리 둘러보기</Link>
          </div>
        </div>
        <div className="hero-stage" aria-hidden="true">
          <div className="stage-orbit orbit-a" /><div className="stage-orbit orbit-b" />
          <div className="stage-card card-mir"><span>MIR</span></div>
          <div className="stage-plus">×</div>
          <div className="stage-card card-band"><Music2 size={44}/><span>BAND</span></div>
        </div>
      </section>

      <section className="section-wrap intro-grid">
        <Link className="feature-card" to="/mir"><span className="feature-icon"><Sparkles /></span><small>VTUBER</small><h2>미르</h2><p>미르님의 방송과 음악 활동을 소개합니다.</p><ArrowRight /></Link>
        <Link className="feature-card" to="/band"><span className="feature-icon"><Music2 /></span><small>MUSICIAN</small><h2>청운밴드</h2><p>밴드 이야기와 멤버들을 만나보세요.</p><ArrowRight /></Link>
        <Link className="feature-card" to="/history"><span className="feature-icon"><CalendarDays /></span><small>HISTORY</small><h2>공연 이력</h2><p>함께한 무대의 발자취를 연도별로 기록합니다.</p><ArrowRight /></Link>
        <Link className="feature-card" to="/gallery"><span className="feature-icon"><PlaySquare /></span><small>MEDIA</small><h2>영상 및 갤러리</h2><p>YouTube 영상과 공연별 사진을 함께 모아 볼 수 있습니다.</p><ArrowRight /></Link>
      </section>
    </>
  );
}
