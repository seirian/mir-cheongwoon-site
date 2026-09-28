import { useState } from 'react';
import { Share2 } from 'lucide-react';
export default function ShareLink({ title, url }) {
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState(false);
  async function share() {
    try {
      if (navigator.share) { await navigator.share({ title, url }); setMessage('공유 창을 열었습니다.'); return; }
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url); setMessage('링크를 복사했습니다.');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      setManual(true); setMessage('아래 주소를 복사해 주세요.');
    }
  }
  return <div className="promo-share"><button className="btn btn-ghost" type="button" onClick={share}><Share2 size={16}/>링크 공유</button><span role="status">{message}</span>{manual && <input aria-label="공유할 주소" value={url} readOnly onFocus={(event) => event.target.select()} />}</div>;
}
