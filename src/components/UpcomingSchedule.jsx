import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, Download, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { buildCalendarIcs, formatEventDate, getKstDateKey, getUpcomingEvents, safeExternalUrl } from '../lib/promotion';
import { mirProfile } from '../data/siteData';

export function CalendarDownload({ event }) {
  const [message, setMessage] = useState('');
  function download() {
    try {
      const text = buildCalendarIcs(event);
      const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url; link.download = `mir-${event.event_date}.ics`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('일정 파일을 저장했습니다. 변경 사항은 자동 반영되지 않습니다.');
    } catch { setMessage('일정 파일을 만들지 못했습니다. 날짜를 확인해 주세요.'); }
  }
  return <div className="promo-calendar-save"><button className="btn btn-ghost" type="button" onClick={download}><Download size={15}/>캘린더에 저장</button><small role="status">{message}</small></div>;
}

export function ScheduleAgenda({ events, heading = '다가오는 일정', limit = 5, now = new Date() }) {
  const next = getUpcomingEvents(events, now, limit);
  return <div className="promo-agenda"><h3>{heading}</h3>{next.length ? next.map((event) => <article className="promo-agenda-item" key={event.id || event.event_date + event.title}>
    <div><time dateTime={event.event_date}>{formatEventDate(event.event_date)}</time><span>{event.start_time?.slice(0, 5) || '시간 미정'} · KST</span></div>
    <div><span className="promo-category">{event.category || '일정'}</span><h4>{event.title}</h4>{event.description && <p>{event.description}</p>}
      <div className="promo-inline-actions">{safeExternalUrl(event.link_url) && <a className="btn btn-ghost" href={safeExternalUrl(event.link_url)} target="_blank" rel="noopener noreferrer">공지·출처 확인<ExternalLink size={14}/></a>}<CalendarDownload event={event}/></div>
    </div>
  </article>) : <p className="promo-empty">새로운 공개 일정이 등록되면 여기에 표시됩니다. 공식 채널에서 최신 공지를 확인해 주세요.</p>}
    <p className="promo-inline-note">한국 시간(KST) 기준 · 휴방·취소·비공개·밴드 연습은 제외합니다. 팬 아카이브에 등록된 일정이므로 변경 여부를 공식 공지에서 확인해 주세요.</p>
  </div>;
}

export default function UpcomingSchedule() {
  const [now, setNow] = useState(() => new Date());
  const [state, setState] = useState({ events: [], loading: Boolean(supabase), error: false });
  const [retry, setRetry] = useState(0);
  const today = getKstDateKey(now);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!supabase) return undefined;
    let active = true; const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    setState((previous) => ({ ...previous, loading: true, error: false }));
    const until = new Date(`${today}T00:00:00+09:00`); until.setUTCDate(until.getUTCDate() + 90);
    supabase.from('schedule_events').select('id,event_date,title,category,start_time,end_time,description,link_url,sort_order')
      .gte('event_date', today).lte('event_date', getKstDateKey(until)).order('event_date').order('sort_order').limit(200).abortSignal(controller.signal)
      .then(({ data, error }) => { if (active) setState({ events: data || [], loading: false, error: Boolean(error) }); })
      .catch(() => { if (active) setState({ events: [], loading: false, error: true }); }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [today, retry]);
  return <section className="section-wrap promo-section promo-next" id="next-event" aria-labelledby="next-event-title">
    <div className="promo-section-head"><div><span className="eyebrow">SEE YOU NEXT</span><h2 id="next-event-title">다음에 만날 수 있는 순간</h2></div><Link className="promo-text-link" to="/schedule"><CalendarDays size={17}/>전체 일정표<ArrowRight size={16}/></Link></div>
    {state.loading ? <p className="promo-empty" role="status">다가오는 일정을 확인하고 있습니다…</p> : state.error ? <div className="promo-empty" role="status"><p>일정을 불러오지 못했습니다. 일정이 없다는 뜻은 아닙니다.</p><button className="btn btn-ghost" type="button" onClick={() => setRetry((value) => value + 1)}>다시 확인</button></div> : <ScheduleAgenda events={state.events} heading="가장 가까운 등록 일정" limit={1} now={now}/>}
    <a className="promo-text-link" href={mirProfile.channels.find(({ label }) => label === '커뮤니티').url} target="_blank" rel="noopener noreferrer">공식 커뮤니티에서 최신 공지 확인<ExternalLink size={14}/></a>
  </section>;
}
