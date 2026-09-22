import { useEffect, useState } from 'react';
import { CalendarPlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

const MIN_DATE = '2025-01-01';
const MAX_DATE = '2030-12-31';
const CATEGORIES = ['기타', '휴방', '합방', '대회', '정기', '특별'];

const createForm = (date, editingEvent) => ({
  event_date: editingEvent?.event_date || date,
  title: editingEvent?.title || '',
  category: editingEvent?.category || '기타',
  start_time: editingEvent?.start_time?.slice(0, 5) || '',
  end_time: editingEvent?.end_time?.slice(0, 5) || '',
  description: editingEvent?.description || '',
  link_url: editingEvent?.link_url || '',
  sort_order: editingEvent?.sort_order || 0,
});

export default function ScheduleQuickAddModal({ date, editingEvent = null, onClose, onSaved, onDeleted }) {
  const [form, setForm] = useState(() => createForm(date, editingEvent));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const isEditing = Boolean(editingEvent?.id);

  useEffect(() => {
    setForm(createForm(date, editingEvent));
    setMessage('');
  }, [date, editingEvent]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const saveEvent = async (submitEvent) => {
    submitEvent.preventDefault();
    if (!supabase || saving) return;

    setSaving(true);
    setMessage('');

    const payload = {
      event_date: form.event_date,
      title: form.title.trim(),
      category: form.category,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      description: form.description.trim() || null,
      link_url: form.link_url.trim() || null,
      sort_order: Number(form.sort_order) || 0,
      manual_override: true,
    };

    const query = isEditing
      ? supabase.from('schedule_events').update(payload).eq('id', editingEvent.id)
      : supabase.from('schedule_events').insert({ ...payload, source_type: 'manual' });

    const { data, error } = await query.select('*').single();
    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    onSaved(data);
    onClose();
  };

  const deleteEvent = async () => {
    if (!supabase || !editingEvent?.id || saving || deleting) return;

    const title = form.title.trim() || editingEvent.title || '선택한 일정';
    const sheetManaged = editingEvent.source_type === 'google_sheet'
      && /^sheet-\d{4}-\d{2}-\d{2}$/.test(String(editingEvent.source_key || ''));
    const syncNotice = sheetManaged
      ? '\n\n시트 연동 일정은 다음 자동 동기화에서 다시 생성되지 않도록 삭제 예외로 등록됩니다.'
      : '';
    const confirmed = window.confirm(
      `"${title}" 일정을 삭제할까요?${syncNotice}\n\n삭제한 일정은 자동으로 복구되지 않습니다.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    setMessage('');

    const { data, error } = await supabase.rpc('admin_delete_schedule_event', {
      p_event_id: editingEvent.id,
    });

    setDeleting(false);
    if (error) {
      setMessage('일정 삭제에 실패했습니다: ' + error.message);
      return;
    }

    onDeleted?.(editingEvent.id, data);
    onClose();
  };

  return (
    <div className="schedule-quick-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="schedule-quick-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-quick-modal-title">
        <div className="schedule-quick-modal-head">
          <div>
            <span>{isEditing ? 'ADMIN QUICK EDIT' : 'ADMIN QUICK ADD'}</span>
            <h2 id="schedule-quick-modal-title">
              {isEditing ? <Pencil size={22} /> : <CalendarPlus size={22} />}
              {isEditing ? '일정 수정' : '일정 등록'}
            </h2>
            <p>{isEditing ? '선택한 일정의 내용을 바로 수정할 수 있습니다.' : '선택한 날짜가 기본값으로 지정되었습니다.'}</p>
          </div>
          <button type="button" className="schedule-quick-close" onClick={onClose} aria-label="일정 편집 창 닫기">
            <X size={20} />
          </button>
        </div>

        <form className="schedule-quick-form" onSubmit={saveEvent}>
          <label>
            <span>날짜</span>
            <input
              type="date"
              min={MIN_DATE}
              max={MAX_DATE}
              value={form.event_date}
              onChange={(event) => updateForm('event_date', event.target.value)}
              required
            />
          </label>

          <label>
            <span>분류</span>
            <select value={form.category} onChange={(event) => updateForm('category', event.target.value)}>
              {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>

          <div className="schedule-quick-time-grid">
            <label>
              <span>시작 시간</span>
              <input type="time" value={form.start_time} onChange={(event) => updateForm('start_time', event.target.value)} />
            </label>
            <label>
              <span>종료 시간</span>
              <input type="time" value={form.end_time} onChange={(event) => updateForm('end_time', event.target.value)} />
            </label>
          </div>

          <label className="schedule-quick-wide">
            <span>일정 내용</span>
            <textarea
              rows="5"
              value={form.title}
              onChange={(event) => updateForm('title', event.target.value)}
              placeholder="방송, 휴방, 합방 등 일정을 입력하세요."
              autoFocus
              required
            />
          </label>

          <label className="schedule-quick-wide">
            <span>추가 설명</span>
            <textarea rows="3" value={form.description} onChange={(event) => updateForm('description', event.target.value)} />
          </label>

          <label className="schedule-quick-wide">
            <span>관련 링크</span>
            <input type="url" placeholder="https://" value={form.link_url} onChange={(event) => updateForm('link_url', event.target.value)} />
          </label>

          <label>
            <span>표시 순서</span>
            <input type="number" value={form.sort_order} onChange={(event) => updateForm('sort_order', event.target.value)} />
          </label>

          {message && <div className="schedule-quick-message">{message}</div>}

          <div className="schedule-quick-actions">
            {isEditing && (
              <button
                type="button"
                className="btn schedule-delete-button"
                onClick={deleteEvent}
                disabled={saving || deleting}
              >
                <Trash2 size={17} />
                {deleting ? '삭제 중...' : '일정 삭제'}
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving || deleting}>취소</button>
            <button type="submit" className="btn btn-primary" disabled={saving || deleting}>
              {isEditing ? <Pencil size={17} /> : <Plus size={17} />}
              {saving ? '저장 중...' : isEditing ? '수정 저장' : '일정 추가'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
