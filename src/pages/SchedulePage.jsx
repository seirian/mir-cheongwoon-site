import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import PageHero from '../components/PageHero';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const YEAR = 2026;
const MONTHS = Array.from({ length: 12 }, (_, index) => index);
const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const CATEGORIES = ['휴방', '합방', '대회', '정기', '특별'];

const pad = (value) => String(value).padStart(2, '0');
const toDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export default function SchedulePage() {
  const now = new Date();
  const initialMonth = now.getFullYear() === YEAR ? now.getMonth() : 0;
  const [month, setMonth] = useState(Math.min(11, Math.max(0, initialMonth)));
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadSchedule() {
      if (!supabase) {
        setLoading(false);
        return;
      }

      const { data, error: loadError } = await supabase
        .from('schedule_events')
        .select('*')
        .gte('event_date', `${YEAR}-01-01`)
        .lte('event_date', `${YEAR}-12-31`)
        .order('event_date', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (loadError) setError('일정표를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      setEvents(data || []);
      setLoading(false);
    }

    loadSchedule();
  }, []);

  const eventsByDate = useMemo(() => {
    return events.reduce((map, event) => {
      if (!map[event.event_date]) map[event.event_date] = [];
      map[event.event_date].push(event);
      return map;
    }, {});
  }, [events]);

  const days = useMemo(() => {
    const first = new Date(YEAR, month, 1);
    const startOffset = first.getDay();
    return Array.from({ length: 42 }, (_, index) => new Date(YEAR, month, 1 - startOffset + index));
  }, [month]);

  const todayKey = toDateKey(now);

  return (
    <>
      <PageHero eyebrow="MIR SCHEDULE" title="일정표" description="기존 월별 시트의 기록을 그대로 이어가는 미르의 2026년 일정 아카이브입니다." />
      <section className="section-wrap schedule-section">
        {!isSupabaseConfigured && <div className="setup-banner">Supabase 연결이 필요합니다.</div>}

        <div className="schedule-toolbar">
          <button className="schedule-nav-button" disabled={month === 0} onClick={() => setMonth((value) => Math.max(0, value - 1))} aria-label="이전 달">
            <ChevronLeft size={20} />
          </button>
          <div className="schedule-heading">
            <small>MIR MONTHLY SCHEDULE</small>
            <h2>✨ {YEAR}년 {month + 1}월</h2>
          </div>
          <button className="schedule-nav-button" disabled={month === 11} onClick={() => setMonth((value) => Math.min(11, value + 1))} aria-label="다음 달">
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="schedule-month-tabs" aria-label="월 선택">
          {MONTHS.map((item) => (
            <button key={item} className={item === month ? 'active' : ''} onClick={() => setMonth(item)}>
              {item + 1}월
            </button>
          ))}
        </div>

        <div className="schedule-legend">
          {CATEGORIES.map((category) => <span key={category} className={`category-${category}`}>{category}</span>)}
          <span className="category-기타">기타 일정</span>
        </div>

        {error && <div className="admin-message">{error}</div>}
        {loading ? <div className="loading">일정표를 불러오는 중...</div> : (
          <div className="schedule-scroll">
            <div className="sheet-calendar">
              <div className="schedule-weekdays">
                {DAY_LABELS.map((day, index) => <div key={day} className={index === 0 ? 'sunday' : index === 6 ? 'saturday' : ''}>{day}</div>)}
              </div>
              <div className="schedule-grid">
                {days.map((date) => {
                  const key = toDateKey(date);
                  const dayEvents = eventsByDate[key] || [];
                  const isCurrentMonth = date.getFullYear() === YEAR && date.getMonth() === month;
                  const isToday = key === todayKey;
                  return (
                    <article key={key} className={`schedule-day${isCurrentMonth ? '' : ' outside-month'}${isToday ? ' today' : ''}`}>
                      <div className="schedule-date">{date.getDate()}</div>
                      <div className="schedule-day-events">
                        {dayEvents.map((event) => (
                          <div key={event.id} className={`schedule-event category-${event.category || '기타'}`}>
                            {(event.start_time || event.end_time) && (
                              <div className="schedule-event-time">
                                {event.start_time?.slice(0, 5)}{event.end_time ? ` ~ ${event.end_time.slice(0, 5)}` : ''}
                              </div>
                            )}
                            <div className="schedule-event-title">{event.title}</div>
                            {event.description && <div className="schedule-event-description">{event.description}</div>}
                            {event.link_url && <a href={event.link_url} target="_blank" rel="noreferrer">관련 링크</a>}
                          </div>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        <p className="schedule-note">일정 기록이 없는 달도 2026년 12월까지 확인할 수 있습니다. 기존 2026년 1~9월 기록은 Google Sheet 내용을 기준으로 이관했습니다.</p>
      </section>
    </>
  );
}
