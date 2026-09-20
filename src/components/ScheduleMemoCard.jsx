import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

const FALLBACK_MEMO = '월별로 남겨둘 공지, 체크할 내용이나 짧은 기록을 표시하는 영역입니다.';
const MAX_MEMO_LENGTH = 2000;

const splitHistory = (value) => String(value || '')
  .split(/\n\s*\n/g)
  .map((item) => item.trim())
  .filter(Boolean);

export default function ScheduleMemoCard({ isAdmin }) {
  const [memo, setMemo] = useState('');
  const [waktaverseHistory, setWaktaverseHistory] = useState('');
  const [vrMocapHistory, setVrMocapHistory] = useState('');
  const [sourceSheet, setSourceSheet] = useState('');
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
        .select('content,waktaverse_history,vr_mocap_history,source_sheet,synced_at')
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
      setWaktaverseHistory(data?.waktaverse_history ?? '');
      setVrMocapHistory(data?.vr_mocap_history ?? '');
      setSourceSheet(data?.source_sheet ?? '');
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

  const hoverItems = useMemo(() => ([
    {
      id: 'waktaverse',
      label: '미르님 왁타버스 참여 이력',
      entries: splitHistory(waktaverseHistory),
    },
    {
      id: 'vr-mocap',
      label: '미르님 VR/모캡 컨텐츠 참여 이력',
      entries: splitHistory(vrMocapHistory),
    },
  ]), [waktaverseHistory, vrMocapHistory]);

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
        <div className="memo-card-heading">
          <div>
            <span>MEMO</span>
            <h3>메모</h3>
          </div>
          {sourceSheet && <small>{sourceSheet} SHEET</small>}
        </div>

        {loading ? (
          <p className="memo-readonly-content">메모를 불러오는 중...</p>
        ) : isAdmin ? (
          <div className="memo-editor">
            <textarea
              className="memo-editor-textarea"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={MAX_MEMO_LENGTH}
              rows={5}
              placeholder="일정표에 표시할 메모를 입력하세요."
              aria-label="일정표 메모"
            />
            <div className="memo-editor-actions">
              <small>{draft.length.toLocaleString()} / {MAX_MEMO_LENGTH.toLocaleString()}</small>
              <button type="button" onClick={handleSave} disabled={saving || draft === memo}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
            <p className="memo-sheet-sync-hint">엑셀 자동 동기화 시 메모 본문이 다시 반영될 수 있습니다.</p>
            {message && <p className={`memo-save-status${message === '저장되었습니다.' ? ' success' : ''}`}>{message}</p>}
          </div>
        ) : (
          <p className="memo-readonly-content">{memo || FALLBACK_MEMO}</p>
        )}

        {!loading && (
          <div className="memo-reference-list" aria-label="미르 참여 이력 메모">
            {hoverItems.map((item) => (
              <div className="memo-reference-item" key={item.id}>
                <button type="button" className="memo-reference-trigger" aria-haspopup="true">
                  <span>{item.label}</span>
                  <small>HOVER · TAP</small>
                  <ChevronRight size={15} />
                </button>
                <div className="memo-history-popover" role="tooltip">
                  <div className="memo-history-head">
                    <span>SPREADSHEET NOTE</span>
                    <strong>{item.label}</strong>
                  </div>
                  {item.entries.length ? (
                    <ol className="memo-history-list">
                      {item.entries.map((entry, index) => (
                        <li key={`${item.id}-${index}`}>
                          {entry.split('\n').map((line, lineIndex) => (
                            <span key={`${item.id}-${index}-${lineIndex}`}>{line}</span>
                          ))}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="memo-history-empty">등록된 이력이 없습니다.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
