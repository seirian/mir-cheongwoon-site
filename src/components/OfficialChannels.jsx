import { ArrowUpRight } from 'lucide-react';
import { mirProfile } from '../data/siteData';
const descriptions = { SOOP: '지금의 미르, 생방송에서', YouTube: '노래와 방송을 다시 만나기', X: '새 소식과 짧은 이야기', 커뮤니티: '구르미와 함께하는 미리내' };
export default function OfficialChannels() {
  return <section className="section-wrap promo-section" id="official-channels" aria-labelledby="channels-title">
    <div className="promo-section-head"><div><span className="eyebrow">STAY CONNECTED</span><h2 id="channels-title">다음 만남은 공식 채널에서</h2></div><p>이곳은 비공식 팬 아카이브입니다.<br/>최신 공지와 활동 문의는 공식 채널을 확인해 주세요.</p></div>
    <div className="promo-channels">{mirProfile.channels.map((channel) => <a href={channel.url} key={channel.label} target="_blank" rel="noopener noreferrer"><span>{channel.label}<ArrowUpRight size={18}/></span><strong>{channel.name}</strong><small>{descriptions[channel.label]}</small></a>)}</div>
  </section>;
}
