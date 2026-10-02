import {useEffect, useState} from 'react';
import {Music2, TvMinimalPlay} from 'lucide-react';
import {coverFor, vodLinks} from '../../lib/songbookMedia';

export function VideoMark({platform}) {
  return platform === 'youtube'
    ? <svg width="20" height="16" viewBox="0 0 24 18" aria-hidden="true"><rect x="0" y="1" width="24" height="16" rx="5" fill="currentColor"/><path d="m10 5 6 4-6 4z" fill="#11151f"/></svg>
    : <TvMinimalPlay size={19} aria-hidden="true"/>;
}
export function VodLinks({urls, title, detailed = false}) {
  const links = vodLinks(urls);
  return <span className={detailed ? 'sb3-vods is-detailed' : 'sb3-vods'}>
    {links.map(v => {
      const label = `${v.label}${v.total > 1 ? ` ${v.number}` : ''}`;
      return <a key={v.url} className={`sb2-video sb3-vod is-${v.platform}`} href={v.url} target="_blank" rel="noopener noreferrer" title={`${title} · ${label} 새 탭에서 보기`} aria-label={`${title} ${label} 새 탭에서 보기`}>
        <VideoMark platform={v.platform}/><span className={detailed || v.platform === 'soop' ? 'sb3-vod-label' : 'sb-sr-only'}>{detailed ? v.label : v.platform === 'soop' ? 'SOOP' : 'YouTube'}</span>{v.total > 1 && <small>{v.number}</small>}{detailed && <span aria-hidden="true">↗</span>}
      </a>;
    })}
  </span>;
}
export function SongCover({song}) {
  const cover = coverFor(song);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [cover?.url]);
  if (!cover || failed) return <span className="sb3-cover is-empty" role="img" aria-label={`${song.title} 이미지 없음`}><Music2 size={25}/></span>;
  return <span className="sb3-cover-wrap">
    <a className={`sb3-cover is-${cover.kind}`} href={cover.href} target="_blank" rel="noopener noreferrer" title={`${song.title} · ${cover.label}`}>
      <img width="64" height="64" loading="lazy" decoding="async" referrerPolicy="no-referrer" src={cover.url} alt={`${song.title} ${cover.label}`} onError={() => setFailed(true)}/>
      {cover.kind === 'video' && <span className="sb3-cover-kind" aria-hidden="true">VOD</span>}
    </a>
    {cover.kind === 'album' && <a className="sb3-store-badge" href={cover.href} target="_blank" rel="noopener noreferrer" aria-label={`${song.title} iTunes에서 보기`}><img src="https://linkmaker.itunes.apple.com/assets/shared/badges/en-us/itunes-sm.svg" alt="Download on iTunes" width="61" height="15" loading="lazy"/></a>}
  </span>;
}
