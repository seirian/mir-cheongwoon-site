import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
import PageHero from '../components/PageHero';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const MIN_YEAR = 2025;
const MAX_YEAR = 2030;
const YEARS = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, index) => MIN_YEAR + index);
const MONTHS = Array.from({ length: 12 }, (_, index) => index);
const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const CATEGORIES = ['휴방', '합방', '대회', '정기', '특별'];
const RELATIVE_DAYS = [
  { id: 'yesterday', label: '어제', offset: -1 },
  { id: 'today', label: '오늘', offset: 0 },
  { id: 'tomorrow', label: '내일', offset: 1 },
];

const pad = (value) => String(value).padStart(2, '0');
const toDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const formatSideDate = (date) => `${date.getMonth() + 1}월 ${date.getDate()}일`;

export default function SchedulePage() {
  const now = new Date();
  const initialYear = Math.min(MAX_YEAR, Math.max(MIN_YEAR, now.getFullYear()));
  const initialMonth = now.getFullYear() >= MIN_YEAR && now.getFullYear() <= MAX_YEAR ? now.getMonth() : 0;
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [daySummary, setDaySummary] = useState('today');

  useEffect(() => {
    async function loadSchedule() {
      if (!supabase) {
        setLoading(false);
        return;
      }

      const { data, error: loadError } = await supabase
        .from('schedule_events')
        .select('*')
        .gte('event_date', `${MIN_YEAR}-01-01`)
        .lte('event_date', `${MAX_YEAR}-12-31`)
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
    const first = new Date(year, month, 1);
    const startOffset = first.getDay();
    return Array.from({ length: 42 }, (_, index) => new Date(year, month, 1 - startOffset + index));
  }, [year, month]);

  const sideDays = useMemo(() => {
    return RELATIVE_DAYS.reduce((map, item) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + item.offset);
      map[item.id] = {
        ...item,
        date,
        key: toDateKey(date),
      };
      return map;
    }, {});
  }, []);

  const selectedSideDay = sideDays[daySummary];
  const selectedSideEvents = eventsByDate[selectedSideDay.key] || [];

  const moveMonth = (offset) => {
    const next = new Date(year, month + offset, 1);
    const nextYear = next.getFullYear();
    const nextMonth = next.getMonth();
    if (nextYear < MIN_YEAR || nextYear > MAX_YEAR) return;
    setYear(nextYear);
    setMonth(nextMonth);
  };

  const isFirstMonth = year === MIN_YEAR && month === 0;
  const isLastMonth = year === MAX_YEAR && month === 11;
  const todayKey = toDateKey(now);

  return (
    <>
      <PageHero eyebrow="MIR SCHEDULE" title="일정표" description="월별 일정과 오늘의 기록, 팬아트와 메모를 한 화면에서 확인할 수 있는 미르 일정 대시보드입니다." />
      <section className="section-wrap schedule-section">
        {!isSupabaseConfigured && <div className="setup-banner">Supabase 연결이 필요합니다.</div>}

        <div className="schedule-control-panel">
          <div className="schedule-toolbar">
            <button className="schedule-nav-button" disabled={isFirstMonth} onClick={() => moveMonth(-1)} aria-label="이전 달">
              <ChevronLeft size={20} />
            </button>
            <div className="schedule-heading">
              <small>MIR MONTHLY SCHEDULE</small>
              <h2>✨ {year}년 {month + 1}월</h2>
            </div>
            <button className="schedule-nav-button" disabled={isLastMonth} onClick={() => moveMonth(1)} aria-label="다음 달">
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="schedule-period-group">
            <span className="schedule-period-label">YEAR</span>
            <div className="schedule-year-tabs" aria-label="연도 선택">
              {YEARS.map((item) => (
                <button key={item} className={item === year ? 'active' : ''} onClick={() => setYear(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="schedule-period-group schedule-period-group-month">
            <span className="schedule-period-label">MONTH</span>
            <div className="schedule-month-tabs" aria-label="월 선택">
              {MONTHS.map((item) => (
                <button key={item} className={item === month ? 'active' : ''} onClick={() => setMonth(item)}>
                  {item + 1}월
                </button>
              ))}
            </div>
          </div>

          <div className="schedule-legend">
            {CATEGORIES.map((category) => (
              <span key={category}>
                <i className={`category-${category}`} />{category}
              </span>
            ))}
            <span><i className="category-기타" />기타 일정</span>
          </div>
        </div>

        {error && <div className="admin-message">{error}</div>}
        {loading ? <div className="loading">일정표를 불러오는 중...</div> : (
          <div className="schedule-dashboard">
            <section className="schedule-main-panel">
              <div className="schedule-panel-head">
                <div>
                  <span>MONTHLY SCHEDULE</span>
                  <h3>{year}년 {month + 1}월 일정</h3>
                </div>
                <small>월별 방송과 주요 일정을 확인하세요.</small>
              </div>
              <div className="schedule-scroll-hint">← 좌우로 밀어서 일정을 확인하세요 →</div>
              <div className="schedule-scroll">
                <div className="sheet-calendar">
                  <div className="schedule-weekdays">
                    {DAY_LABELS.map((day, index) => <div key={day} className={index === 0 ? 'sunday' : index === 6 ? 'saturday' : ''}>{day}</div>)}
                  </div>
                  <div className="schedule-grid">
                    {days.map((date) => {
                      const key = toDateKey(date);
                      const dayEvents = eventsByDate[key] || [];
                      const isCurrentMonth = date.getFullYear() === year && date.getMonth() === month;
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
            </section>

            <aside className="schedule-sidebar">
              <section className="schedule-side-card schedule-daily-card">
                <div className="schedule-side-heading">
                  <span>DAILY NOTE</span>
                  <h3>어제 · 오늘 그리고 내일</h3>
                </div>
                <div className="day-summary-tabs" role="tablist" aria-label="일자별 일정 요약">
                  {RELATIVE_DAYS.map((item) => (
                    <button key={item.id} className={daySummary === item.id ? 'active' : ''} onClick={() => setDaySummary(item.id)}>
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="day-summary-date">
                  <strong>{selectedSideDay.label}</strong>
                  <span>{formatSideDate(selectedSideDay.date)}</span>
                </div>
                <div className="day-summary-list">
                  {selectedSideEvents.length ? selectedSideEvents.map((event) => (
                    <div className={`day-summary-event category-${event.category || '기타'}`} key={event.id}>
                      <i />
                      <div>
                        {(event.start_time || event.end_time) && <small>{event.start_time?.slice(0, 5)}{event.end_time ? ` ~ ${event.end_time.slice(0, 5)}` : ''}</small>}
                        <p>{event.title}</p>
                      </div>
                    </div>
                  )) : <p className="schedule-side-empty">등록된 일정이 없습니다.</p>}
                </div>
              </section>

              <section className="schedule-side-card schedule-note-card memo-card">
                <div>
                  <span>MEMO</span>
                  <h3>메모</h3>
                  <p>월별로 남겨둘 공지, 체크할 내용이나 짧은 기록을 표시하는 영역입니다.</p>
                </div>
              </section>

              <section className="schedule-side-card fanart-card">
                <div className="schedule-side-heading fanart-heading">
                  <div>
                    <span>FAN ART</span>
                    <h3>오늘의 팬아트</h3>
                  </div>
                  <small>FEATURED</small>
                </div>
                <div className="fanart-visual" role="img" aria-label="팬아트 이미지 영역 미리보기">
                  <div className="fanart-placeholder">
                    <ImageIcon size={42} />
                    <strong>FAN ART</strong>
                    <p>고정 영역 안에서 원본 비율을 유지해 크게 표시됩니다.</p>
                  </div>
                </div>
                <div className="fanart-caption">
                  <div>
                    <strong>팬아트 제목 영역</strong>
                    <span>@artist</span>
                  </div>
                  <button type="button" aria-label="이전 팬아트"><ChevronLeft size={17} /></button>
                  <button type="button" aria-label="다음 팬아트"><ChevronRight size={17} /></button>
                </div>
                <div className="fanart-dots" aria-hidden="true"><i className="active" /><i /><i /></div>
              </section>
            </aside>
          </div>
        )}
      </section>
    </>
  );
}
