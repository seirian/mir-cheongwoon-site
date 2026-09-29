import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon, Pause, Play } from 'lucide-react';
import { FANART_INTERVAL_MS, fanartImageUrls, nextFanartImage } from '../lib/fanartSlides';
import './fanart-slideshow.css';

export default function FanartSlideshow({ fanart }) {
  const images = useMemo(() => fanartImageUrls(fanart), [fanart]);
  return <Slides key={`${fanart.articleId}:${images.join('|')}`} images={images} fanart={fanart}/>;
}

function Slides({ images, fanart }) {
  const [target, setTarget] = useState(images[0] || '');
  const [shown, setShown] = useState('');
  const [requested, setRequested] = useState(() => images.slice(0, 1));
  const [loaded, setLoaded] = useState({});
  const [failed, setFailed] = useState({});
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  const [inView, setInView] = useState(false);
  const root = useRef(null);
  const remaining = images.filter((url) => !failed[url]);
  const multiple = remaining.length > 1;
  const rotating = playing && !hovered && visible && inView && multiple;

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => { setReduced(preference.matches); if (preference.matches) setPlaying(false); };
    const visibility = () => setVisible(document.visibilityState === 'visible');
    preference.addEventListener('change', change);
    document.addEventListener('visibilitychange', visibility);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(root.current);
    return () => { preference.removeEventListener('change', change); document.removeEventListener('visibilitychange', visibility); observer.disconnect(); };
  }, []);

  useEffect(() => {
    if (!target || failed[target]) {
      setTarget(nextFanartImage(images, target, failed));
      return;
    }
    if (loaded[target]) {
      setShown(target);
      // Preload only the next image, rather than downloading the full article on entry.
      const next = nextFanartImage(images, target, failed);
      setRequested((current) => current.includes(next) ? current : [...current, next]);
    } else {
      setRequested((current) => current.includes(target) ? current : [...current, target]);
    }
  }, [images, target, failed, loaded]);

  useEffect(() => {
    if (!rotating || !shown || shown !== target || !loaded[shown]) return undefined;
    const timer = setTimeout(() => setTarget(nextFanartImage(images, shown, failed)), FANART_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [rotating, shown, target, loaded, images, failed]);

  function move(direction) {
    setPlaying(false);
    setTarget(nextFanartImage(images, target, failed, direction));
  }
  const activePosition = remaining.indexOf(shown) + 1;
  return <div className="fanart-slideshow" ref={root} role="group" aria-roledescription="슬라이드 쇼" aria-label={`${fanart.title} 이미지`}
    onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true); }} onPointerLeave={() => setHovered(false)}
    onFocusCapture={(event) => { if (event.target.matches(':focus-visible')) setPlaying(false); }}
    onKeyDown={(event) => { if (multiple && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); } }}>
    {multiple && <div className="fanart-slide-controls">
      <button type="button" className="fanart-rotation" onClick={() => setPlaying((value) => !value)} aria-label={playing ? '팬아트 자동 넘김 일시정지' : '팬아트 자동 넘김 시작'}>{playing ? <Pause size={15}/> : <Play size={15}/>}<span>{playing ? '일시정지' : '자동 넘김'}</span></button>
      <span className="fanart-slide-count" aria-live={rotating ? 'off' : 'polite'} aria-atomic="true">{activePosition || 1} / {remaining.length}</span>
      <button type="button" onClick={() => move(-1)} aria-label="이전 팬아트 이미지"><ChevronLeft size={19}/></button>
      <button type="button" onClick={() => move(1)} aria-label="다음 팬아트 이미지"><ChevronRight size={19}/></button>
    </div>}
    <a className="fanart-visual fanart-live-link fanart-slide-stage" href={fanart.articleUrl} target="_blank" rel="noopener noreferrer" aria-label={`${fanart.title} 원본 게시글 보기`} aria-busy={Boolean(target && !loaded[target])}>
      {remaining.length ? <>
        {!shown && <div className="fanart-placeholder" role="status"><ImageIcon size={36}/><p>팬아트 이미지를 불러오는 중…</p></div>}
        {requested.filter((url) => !failed[url]).map((url) => <img key={url} src={url}
          className={url === shown ? 'fanart-slide is-active' : 'fanart-slide'}
          aria-hidden={url === shown ? undefined : 'true'}
          alt={url === shown ? `${fanart.title} - ${fanart.author}, ${activePosition} / ${remaining.length}` : ''}
          decoding="async" onLoad={() => setLoaded((state) => ({ ...state, [url]: true }))}
          onError={() => setFailed((state) => ({ ...state, [url]: true }))}/>)}
        <span className="fanart-open-label">팬아트 게시글 보기</span>
      </> : <div className="fanart-placeholder" role="status"><ImageIcon size={36}/><strong>FAN ART</strong><p>이미지를 불러오지 못했습니다.<br/>원본 게시글에서 확인해 주세요.</p></div>}
    </a>
    {(fanart.fallback || fanart.stale) && <p className="fanart-slide-note">원본 조회가 원활하지 않아 저장된 이미지를 표시합니다.</p>}
    {reduced && !playing && multiple && <p className="fanart-slide-note">동작 줄이기 설정에 따라 자동 넘김을 멈췄습니다. 버튼으로 감상할 수 있습니다.</p>}
  </div>;
}
