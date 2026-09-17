import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const FALLBACK_MEMO = '월별로 남겨둘 공지, 체크할 내용이나 짧은 기록을 표시하는 영역입니다.';
const MAX_MEMO_LENGTH = 2000;

export default function ScheduleMemoCard({ isAdmin }) {
  const [memo, setMemo] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;

    async function loadMemo() {
      if (!supabase) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('schedule_memo')
        .select('content')
        .eq('id', 1)
        .maybeSingle();

      if (!active) return;
      if (error) {
        setMessage('메모를 불러오지 못했습니다.');
        setLoading(false);
        return;
      }

      const content = data?.content ?? '';
      setMemo(content);
      setDraft(content);
      setLoading(false);
    }

    loadMemo();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setDraft(memo);
      setMessage('');
    }
  }, [isAdmin, memo]);

  const handleSave = async () => {
    if (!supabase || saving) return;
    setSaving(true);
    setMessage('');
    const content = draft.trim();

    const { data, error } = await supabase
      .from('schedule_memo')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select('content')
      .single();

    if (error) {
      setMessage('메모 저장에 실패했습니다.');
    } else {
      const saved = data?.content ?? '';
      setMemo(saved);
      setDraft(saved);
      setMessage('저장되었습니다.');
    }
    setSaving(false);
  };

  return (
    <section className="schedule-side-card schedule-note-card memo-card">
      <div className="memo-card-content">
        <span>MEMO</span>
        <h3>메모</h3>
        {loading ? (
          <p className="memo-readonly-content">메모를 불러오는 중...</p>
        ) : isAdmin ? (
          <div className="memo-editor">
            <textarea
              className="memo-editor-textarea"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={MAX_MEMO_LENGTH}
              rows={6}
              placeholder="일정표에 표시할 메모를 입력하세요."
              aria-label="일정표 메모"
            />
            <div className="memo-editor-actions">
              <small>{draft.length.toLocaleString()} / {MAX_MEMO_LENGTH.toLocaleString()}</small>
              <button type="button" onClick={handleSave} disabled={saving || draft === memo}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
            {message && <p className={`memo-save-status${message === '저장되었습니다.' ? ' success' : ''}`}>{message}</p>}
          </div>
        ) : (
          <p className="memo-readonly-content">{memo || FALLBACK_MEMO}</p>
        )}
      </div>
    </section>
  );
}
