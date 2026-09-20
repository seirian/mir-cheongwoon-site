import { useEffect, useMemo, useState } from 'react';
import { ImagePlus, Save, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const extensionFromFile = (file) => {
  const fromName = file?.name?.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fromName && fromName.length <= 5) return fromName;
  if (file?.type === 'image/png') return 'png';
  if (file?.type === 'image/webp') return 'webp';
  if (file?.type === 'image/gif') return 'gif';
  return 'jpg';
};

export default function BandMemberEditor({
  member = null,
  defaultSortOrder = 10,
  onClose,
  onSaved,
  onDeleted,
}) {
  const [form, setForm] = useState(() => ({
    name: member?.name || '',
    position: member?.position || '',
    comment: member?.comment || '',
    sort_order: member?.sort_order ?? defaultSortOrder,
  }));
  const [file, setFile] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const isEditing = Boolean(member?.id);

  const currentImageUrl = useMemo(() => {
    if (!member?.image_path || !supabase) return '';
    return supabase.storage.from('band-members').getPublicUrl(member.image_path).data.publicUrl;
  }, [member?.image_path]);

  const previewUrl = useMemo(() => {
    if (file) return URL.createObjectURL(file);
    if (removePhoto) return '';
    return currentImageUrl;
  }, [file, removePhoto, currentImageUrl]);

  useEffect(() => {
    return () => {
      if (file && previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    };
  }, [file, previewUrl]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, saving]);

  const validateFile = (nextFile) => {
    if (!nextFile) return true;
    if (!nextFile.type.startsWith('image/')) {
      setMessage('이미지 파일만 업로드할 수 있습니다.');
      return false;
    }
    if (nextFile.size > MAX_IMAGE_BYTES) {
      setMessage('멤버 사진은 10MB 이하 파일만 업로드할 수 있습니다.');
      return false;
    }
    return true;
  };

  const uploadPhoto = async (memberId, uploadFile) => {
    const ext = extensionFromFile(uploadFile);
    const path = `${memberId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from('band-members')
      .upload(path, uploadFile, { cacheControl: '3600', upsert: false });
    if (error) throw error;
    return path;
  };

  const handleFileChange = (event) => {
    const nextFile = event.target.files?.[0] || null;
    setMessage('');
    if (!validateFile(nextFile)) {
      event.target.value = '';
      return;
    }
    setFile(nextFile);
    setRemovePhoto(false);
  };

  const saveMember = async (event) => {
    event.preventDefault();
    if (!supabase || saving) return;

    const name = form.name.trim();
    const position = form.position.trim();
    if (!name || !position) {
      setMessage('이름과 포지션을 입력해 주세요.');
      return;
    }

    setSaving(true);
    setMessage('');

    const payload = {
      name,
      position,
      comment: form.comment.trim(),
      sort_order: Number(form.sort_order) || 0,
      updated_at: new Date().toISOString(),
    };

    let createdRow = null;
    let uploadedPath = '';

    try {
      if (!isEditing) {
        const { data, error } = await supabase
          .from('band_members')
          .insert({ ...payload, image_path: null })
          .select('*')
          .single();
        if (error) throw error;
        createdRow = data;

        if (file) {
          uploadedPath = await uploadPhoto(data.id, file);
          const { data: updated, error: updateError } = await supabase
            .from('band_members')
            .update({ image_path: uploadedPath, updated_at: new Date().toISOString() })
            .eq('id', data.id)
            .select('*')
            .single();
          if (updateError) throw updateError;
          createdRow = updated;
        }

        onSaved(createdRow);
        onClose();
        return;
      }

      let nextImagePath = member.image_path || null;
      if (file) {
        uploadedPath = await uploadPhoto(member.id, file);
        nextImagePath = uploadedPath;
      } else if (removePhoto) {
        nextImagePath = null;
      }

      const { data, error } = await supabase
        .from('band_members')
        .update({ ...payload, image_path: nextImagePath })
        .eq('id', member.id)
        .select('*')
        .single();
      if (error) throw error;

      if (member.image_path && member.image_path !== nextImagePath) {
        await supabase.storage.from('band-members').remove([member.image_path]);
      }

      onSaved(data);
      onClose();
    } catch (error) {
      if (!isEditing && createdRow?.id) {
        await supabase.from('band_members').delete().eq('id', createdRow.id);
      }
      if (uploadedPath) {
        await supabase.storage.from('band-members').remove([uploadedPath]);
      }
      setMessage(error?.message || '멤버 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const deleteMember = async () => {
    if (!isEditing || saving || !supabase) return;
    if (!confirm(`“${member.name}” 멤버를 삭제할까요?\n등록된 사진도 함께 삭제됩니다.`)) return;

    setSaving(true);
    setMessage('');
    const { error } = await supabase.from('band_members').delete().eq('id', member.id);
    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    if (member.image_path) {
      await supabase.storage.from('band-members').remove([member.image_path]);
    }

    onDeleted(member.id);
    onClose();
  };

  return (
    <div className="band-member-editor-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="band-member-editor" role="dialog" aria-modal="true" aria-labelledby="band-member-editor-title">
        <div className="band-member-editor-head">
          <div>
            <span>MEMBER ADMIN</span>
            <h2 id="band-member-editor-title">{isEditing ? '밴드 멤버 수정' : '밴드 멤버 추가'}</h2>
            <p>멤버 정보와 프로필 사진을 밴드 페이지에서 바로 관리합니다.</p>
          </div>
          <button type="button" className="band-member-editor-close" onClick={onClose} disabled={saving} aria-label="닫기">
            <X size={20}/>
          </button>
        </div>

        <form className="band-member-editor-form" onSubmit={saveMember}>
          <div className="band-member-photo-editor">
            <div className="band-member-photo-preview">
              {previewUrl ? (
                <img src={previewUrl} alt="멤버 사진 미리보기" />
              ) : (
                <div className="band-member-photo-empty">
                  <ImagePlus size={34}/>
                  <span>사진 미등록</span>
                  <small>저장 후 기존 일러스트가 대신 표시됩니다.</small>
                </div>
              )}
            </div>

            <div className="band-member-photo-actions">
              <label className="btn btn-ghost band-member-file-button">
                <ImagePlus size={16}/>
                {currentImageUrl ? '사진 교체' : '사진 업로드'}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFileChange} />
              </label>
              {(currentImageUrl || file) && (
                <button type="button" className="band-member-remove-photo" onClick={() => {
                  setFile(null);
                  setRemovePhoto(true);
                  setMessage('');
                }}>
                  사진 제거
                </button>
              )}
              <small>JPG · PNG · WEBP · GIF / 최대 10MB</small>
            </div>
          </div>

          <div className="band-member-editor-fields">
            <label>
              <span>이름</span>
              <input value={form.name} maxLength={80} onChange={(event) => setForm({ ...form, name: event.target.value })} required autoFocus />
            </label>
            <label>
              <span>포지션</span>
              <input value={form.position} maxLength={80} placeholder="GUITAR, BASS, KEYBOARD..." onChange={(event) => setForm({ ...form, position: event.target.value })} required />
            </label>
            <label className="band-member-editor-wide">
              <span>소개 문구</span>
              <textarea rows={4} maxLength={1000} value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} />
            </label>
            <label>
              <span>표시 순서</span>
              <input type="number" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: event.target.value })} />
              <small>숫자가 작을수록 앞에 표시됩니다.</small>
            </label>
          </div>

          {message && <div className="band-member-editor-message">{message}</div>}

          <div className="band-member-editor-footer">
            <div>
              {isEditing && (
                <button type="button" className="band-member-delete-button" onClick={deleteMember} disabled={saving}>
                  <Trash2 size={16}/> 멤버 삭제
                </button>
              )}
            </div>
            <div className="band-member-editor-submit">
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>취소</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <Save size={16}/>{saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
