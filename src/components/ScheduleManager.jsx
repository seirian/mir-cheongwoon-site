import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

const MIN_YEAR = 2025;
const MAX_YEAR = 2030;
const CATEGORIES = ['기타', '휴방', '합방', '대회', '정기', '특별'];
const pad = (value) => String(value).padStart(2, '0');
const now = new Date();
const initialYear = Math.min(MAX_YEAR, Math.max(MIN_YEAR, now.getFullYear()));
const initialMonth = now.getFullYear() >= MIN_YEAR && now.getFullYear() <= MAX_YEAR ? now.getMonth() + 1 : 1;
const initialMonthKey = `${initialYear}-${pad(initialMonth)}`;
const emptyForm = {
  id: null,
  event_date: `${initialMonthKey}-01`,
  title: '',
  category: '기타',
  start_time: '',
  end_time: '',
  description: '',
  link_url: '',
  sort_order: 0,
};

export default function ScheduleManager({ onMessage }) {
  const [events, setEvents] = useState([]);
  const [month, setMonth] = useState(initialMonthKey);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadEvents = async () => {
    const { data, error } = await supabase
      .from('schedule_events')
      .select('*')
      .gte('event_date', `${MIN_YEAR}-01-01`)
      .lte('event_date', `${MAX_YEAR}-12-31`)
      .order('event_date', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) onMessage(error.message);
    setEvents(data || []);
  };

  useEffect(() => { loadEvents(); }, []);

  const visibleEvents = useMemo(
    () => events.filter((event) => event.event_date?.startsWith(month)),
    [events, month],
  );

  const resetForm = () => {
    setForm({ ...emptyForm, event_date: `${month}-01` });
  };

  const saveEvent = async (e) => {
    e.preventDefault();
    setSaving(true);
    onMessage('');

    const payload = {
      event_date: form.event_date,
      title: form.title.trim(),
      category: form.category,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      description: form.description.trim() || null,
      link_url: form.link_url.trim() || null,
      sort_order: Number(form.sort_order) || 0,
      source_type: form.id ? undefined : 'manual',
    };
    if (payload.source_type === undefined) delete payload.source_type;

    const result = form.id
      ? await supabase.from('schedule_events').update(payload).eq('id', form.id)
      : await supabase.from('schedule_events').insert(payload);

    setSaving(false);
    if (result.error) return onMessage(result.error.message);
    onMessage(form.id ? '일정을 수정했습니다.' : '일정을 추가했습니다.');
    resetForm();
    loadEvents();
  };

  const editEvent = (event) => {
    setMonth(event.event_date.slice(0, 7));
    setForm({
      id: event.id,
      event_date: event.event_date,
      title: event.title || '',
      category: event.category || '기타',
      start_time: event.start_time?.slice(0, 5) || '',
      end_time: event.end_time?.slice(0, 5) || '',
      description: event.description || '',
      link_url: event.link_url || '',
      sort_order: event.sort_order || 0,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteEvent = async (event) => {
    if (!confirm(`${event.event_date} 일정을 삭제할까요?`)) return;
    const { error } = await supabase.from('schedule_events').delete().eq('id', event.id);
    if (error) return onMessage(error.message);
    onMessage('일정을 삭제했습니다.');
    if (form.id === event.id) resetForm();
    loadEvents();
  };

  return (
    <div className="schedule-admin-layout">
      <form className="admin-card schedule-form" onSubmit={saveEvent}>
        <div className="admin-card-title"><CalendarPlus /> {form.id ? '일정 수정' : '새 일정'}</div>
        <label>날짜<input type="date" min={`${MIN_YEAR}-01-01`} max={`${MAX_YEAR}-12-31`} value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} required /></label>
        <label>분류<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <div className="schedule-time-fields">
          <label>시작 시간<input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></label>
          <label>종료 시간<input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></label>
        </div>
        <label>일정 내용<textarea rows="8" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
        <label>추가 설명<textarea rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label>관련 링크<input type="url" placeholder="https://" value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} /></label>
        <label>표시 순서<input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></label>
        <button className="btn btn-primary" disabled={saving}><Plus size={17}/>{saving ? '저장 중...' : form.id ? '일정 수정' : '일정 추가'}</button>
        {form.id && <button type="button" className="btn btn-ghost schedule-cancel-edit" onClick={resetForm}><X size={16}/> 수정 취소</button>}
      </form>

      <div className="admin-list">
        <div className="admin-topbar schedule-admin-topbar">
          <div><h2>일정 목록</h2><p>{MIN_YEAR}~{MAX_YEAR}년 월별 일정 관리</p></div>
          <input type="month" min={`${MIN_YEAR}-01`} max={`${MAX_YEAR}-12`} value={month} onChange={(e) => { setMonth(e.target.value); setForm((current) => current.id ? current : { ...current, event_date: `${e.target.value}-01` }); }} />
        </div>
        {visibleEvents.length === 0 ? <div className="empty-state schedule-admin-empty"><p>이 달에는 등록된 일정이 없습니다.</p></div> : visibleEvents.map((event) => (
          <article className="admin-gallery schedule-admin-event" key={event.id}>
            <div className="schedule-admin-event-head">
              <div>
                <div className="schedule-admin-meta"><span>{event.event_date}</span><b className={`category-${event.category || '기타'}`}>{event.category || '기타'}</b>{event.source_type === 'google_sheet' && <small>기존 시트 이관</small>}</div>
                <pre>{event.title}</pre>
                {event.description && <p>{event.description}</p>}
              </div>
              <div className="schedule-admin-actions">
                <button type="button" className="schedule-edit-button" onClick={() => editEvent(event)} title="일정 수정"><Pencil size={16}/></button>
                <button type="button" className="icon-danger" onClick={() => deleteEvent(event)} title="일정 삭제"><Trash2 size={16}/></button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
