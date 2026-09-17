import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
import PageHero from '../components/PageHero';
import ScheduleQuickAddModal from '../components/ScheduleQuickAddModal';
import ScheduleMemoCard from '../components/ScheduleMemoCard';
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
const formatFanartDate = (dateKey) => {
  if (!dateKey) return '';
  const [, month, day] = dateKey.split('-');
  return `${Number(month)}월 ${Number(day)}일`;
};
const sortScheduleEvents = (left, right) => (
  String(left.event_date || '').localeCompare(String(right.event_date || ''))
  || (Number(left.sort_order) || 0) - (Number(right.sort_order) || 0)
  || String(left.created_at || '').localeCompare(String(right.created_at || ''))
);

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
  const [fanart, setFanart] = useState(null);
  const [fanartLoading, setFanartLoading] = useState(true);
  const [fanartError, setFanartError] = useState(false);
  const [fanartReason, setFanartReason] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [quickAddDate, setQuickAddDate] = useState('');

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

  useEffect(() => {
    if (!supabase) return undefined;

    let active = true;

    const resolveAdmin = async (session) => {
      if (!session?.user) {
        if (active) setIsAdmin(false);
        return;
      }

      const { data } = await supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (active) setIsAdmin(Boolean(data));
    };

    supabase.auth.getSession().then(({ data }) => resolveAdmin(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => resolveAdmin(session));

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadFeaturedFanart() {
      try {
        const response = await fetch(import.meta.env.BASE_URL + 'api/naver-fanart.php', {
          headers: { Accept: 'application/json' },
        });
        const data = await response.json();
        if (cancelled) return;
        setFanartReason(data?.reason || '');

        if (response.ok && data?.status === 'ok' && data.imageUrl && data.articleUrl) {
          setFanart(data);
          setFanartError(false);
        } else {
          setFanart(null);
          setFanartError(true);
        }
      } catch (loadError) {
        console.error('Featured fan art load failed', loadError);
        if (!cancelled) {
          setFanart(null);
          setFanartError(true);
        }
      } finally {
        if (!cancelled) setFanartLoading(false);
      }
    }

    loadFeaturedFanart();
    return () => {
      cancelled = true;
    };
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

  const handleQuickAddSaved = (newEvent) => {
    setEvents((current) => [...current, newEvent].sort(sortScheduleEvents));
    const [savedYear, savedMonth] = newEvent.event_date.split('-').map(Number);
    if (savedYear >= MIN_YEAR && savedYear <= MAX_YEAR) {
      setYear(savedYear);
      setMonth(savedMonth - 1);
    }
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
              {isAdmin && <div className="schedule-admin-mode-hint">관리자 모드 · 날짜 칸을 클릭하면 해당 날짜로 일정을 바로 등록할 수 있습니다.</div>}
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
                      const canQuickAdd = isAdmin && date.getFullYear() >= MIN_YEAR && date.getFullYear() <= MAX_YEAR;
                      const openQuickAdd = () => {
                        if (canQuickAdd) setQuickAddDate(key);
                      };

                      return (
                        <article
                          key={key}
                          className={`schedule-day${isCurrentMonth ? '' : ' outside-month'}${isToday ? ' today' : ''}${canQuickAdd ? ' admin-clickable' : ''}`}
                          onClick={(event) => {
                            if (event.target.closest('a, button')) return;
                            openQuickAdd();
                          }}
                          onKeyDown={(event) => {
                            if (!canQuickAdd || (event.key !== 'Enter' && event.key !== ' ')) return;
                            event.preventDefault();
                            openQuickAdd();
                          }}
                          tabIndex={canQuickAdd ? 0 : undefined}
                          aria-label={canQuickAdd ? `${key} 일정 추가` : undefined}
                        >
                          <div className="schedule-date">
                            <span>{date.getDate()}</span>
                            {canQuickAdd && <span className="schedule-quick-add-chip">+ 일정</span>}
                          </div>
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

              <ScheduleMemoCard isAdmin={isAdmin} />

              <section className="schedule-side-card fanart-card">
                <div className="schedule-side-heading fanart-heading">
                  <div>
                    <span>FAN ART</span>
                    <h3>오늘의 팬아트</h3>
                  </div>
                  <small>{fanart ? (fanart.isToday ? 'TODAY' : `RECENT · ${formatFanartDate(fanart.sourceDate)}`) : 'FEATURED'}</small>
                </div>

                {fanartLoading ? (
                  <div className="fanart-visual" role="status" aria-label="팬아트 불러오는 중">
                    <div className="fanart-placeholder fanart-loading">
                      <ImageIcon size={42} />
                      <strong>LOADING</strong>
                      <p>오늘의 팬아트를 불러오고 있습니다.</p>
                    </div>
                  </div>
                ) : fanart ? (
                  <a className="fanart-visual fanart-live-link" href={fanart.articleUrl} target="_blank" rel="noreferrer" aria-label={`${fanart.title} 게시글 보기`}>
                    <img
                      src={fanart.imageUrl}
                      alt={`${fanart.title} - ${fanart.author}`}
                      onError={() => {
                        setFanart(null);
                        setFanartError(true);
                      }}
                    />
                    <span className="fanart-open-label">팬아트 게시글 보기</span>
                  </a>
                ) : (
                  <div className="fanart-visual" role="img" aria-label="팬아트 이미지 영역">
                    <div className="fanart-placeholder">
                      <ImageIcon size={42} />
                      <strong>FAN ART</strong>
                      <p>{fanartReason === 'upstream_access_restricted' ? '네이버에서 자동 조회가 허용되지 않아 팬아트를 표시할 수 없습니다.' : fanartReason === 'upstream_rate_limited' ? '네이버 요청 제한으로 자동 조회를 잠시 멈췄습니다.' : fanartError ? '팬아트를 불러오지 못했습니다. 다른 메뉴는 정상 이용할 수 있습니다.' : '표시할 팬아트가 없습니다.'}</p>
                      <a href="https://cafe.naver.com/f-e/cafes/31003156/menus/10?viewType=I" target="_blank" rel="noreferrer">팬아트 게시판에서 보기</a>
                    </div>
                  </div>
                )}

                <div className="fanart-caption fanart-live-caption">
                  <div>
                    <strong>{fanart?.title || '오늘의 팬아트'}</strong>
                    <span>{fanart ? fanart.author : '네이버 팬아트 게시판에서 자동으로 선정됩니다.'}</span>
                  </div>
                  {fanart && (
                    <a className="fanart-post-link" href={fanart.articleUrl} target="_blank" rel="noreferrer">
                      원본 게시글
                    </a>
                  )}
                </div>
              </section>
            </aside>
          </div>
        )}
      </section>

      {quickAddDate && isAdmin && (
        <ScheduleQuickAddModal
          date={quickAddDate}
          onClose={() => setQuickAddDate('')}
          onSaved={handleQuickAddSaved}
        />
      )}
    </>
  );
}
