import { useState } from 'react';

// Read the existing public image directly. This review has no hero auth, listing POST or editor.
export default function PolicyPreviewHero() {
  const [failed, setFailed] = useState(false);
  const origin = import.meta.env.VITE_SUPABASE_URL;
  const image = origin ? `${origin}/storage/v1/object/public/gallery/site-hero/production/current.webp` : '';
  return <figure className="promo-hero-art">
    <span className="promo-art-word" aria-hidden="true">MIR</span><div className="promo-art-ring" aria-hidden="true"/>
    {image && !failed && <img className="promo-mir-portrait" src={image} alt="청룡 버튜버 미르 캐릭터" width="548" height="574" fetchPriority="high" decoding="async" onError={() => setFailed(true)}/>}
    <figcaption><span>VIRTUAL VOICE. LIVE SOUND.</span><strong>미르 <b>×</b> 청운밴드</strong><small>노래로 만나, 무대로 이어지는 이야기</small></figcaption>
    {(!image || failed) && <span className="promo-art-index">MIR / CHEONGWOON<br/>이용자 안내 검토용 미리보기</span>}
  </figure>;
}
