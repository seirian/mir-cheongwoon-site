import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, ShieldCheck } from 'lucide-react';
import PageHero from '../components/PageHero';
import BandMemberEditor from '../components/BandMemberEditor';
import { bandInfo } from '../data/siteData';
import CHEONGWOON_HERO_IMAGE from '../data/cheongwoonHeroImage';
import {
  MAENGGAMJA_ILLUSTRATION,
  RANDOM_MEMBER_ILLUSTRATIONS,
  RAY_ILLUSTRATION,
  SWEETBERRY_ILLUSTRATION,
} from '../data/bandMemberIllustrations';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import '../band-page.css';

const PUBLIC_BASE = import.meta.env.BASE_URL || '/';
const DEFAULT_MEMBER_IMAGE = `${PUBLIC_BASE}images/cheongwoon-member-default.webp`;
const BAND_TAGLINE_HIGHLIGHT = '미르와 함께 여름을 노래하는 동료';

function shuffleIllustrations(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function sortMembers(items) {
  return [...items].sort((left, right) => (
    (Number(left.sort_order) || 0) - (Number(right.sort_order) || 0)
    || String(left.created_at || '').localeCompare(String(right.created_at || ''))
    || String(left.name || '').localeCompare(String(right.name || ''))
  ));
}

export default function BandPage() {
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [memberError, setMemberError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [addingMember, setAddingMember] = useState(false);
  const [taglineBefore, taglineAfter] = bandInfo.tagline.split(BAND_TAGLINE_HIGHLIGHT);

  const loadMembers = async () => {
    if (!supabase) {
      setLoadingMembers(false);
      return;
    }

    const { data, error } = await supabase
      .from('band_members')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      setMemberError('밴드 멤버 정보를 불러오지 못했습니다.');
      setLoadingMembers(false);
      return;
    }

    setMembers(data || []);
    setMemberError('');
    setLoadingMembers(false);
  };

  useEffect(() => {
    loadMembers();
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

  const memberVisuals = useMemo(() => {
    const shuffled = shuffleIllustrations(RANDOM_MEMBER_ILLUSTRATIONS);
    let randomIndex = 0;

    return members.reduce((map, member) => {
      if (member.image_path && supabase) {
        map[member.id] = supabase.storage.from('band-members').getPublicUrl(member.image_path).data.publicUrl;
        return map;
      }
      if (member.name === 'Ray') {
        map[member.id] = RAY_ILLUSTRATION;
        return map;
      }
      if (member.name === 'SweetBerry') {
        map[member.id] = SWEETBERRY_ILLUSTRATION;
        return map;
      }
      if (member.name === '맹감자') {
        map[member.id] = MAENGGAMJA_ILLUSTRATION;
        return map;
      }

      map[member.id] = shuffled[randomIndex % shuffled.length] || DEFAULT_MEMBER_IMAGE;
      randomIndex += 1;
      return map;
    }, {});
  }, [members]);

  const defaultSortOrder = useMemo(() => {
    const highest = members.reduce((max, member) => Math.max(max, Number(member.sort_order) || 0), 0);
    return highest + 10;
  }, [members]);

  const handleMemberImageError = (event) => {
    if (event.currentTarget.dataset.fallbackApplied === 'true') return;
    event.currentTarget.dataset.fallbackApplied = 'true';
    event.currentTarget.src = DEFAULT_MEMBER_IMAGE;
  };

  const handleMemberSaved = (savedMember) => {
    setMembers((current) => {
      const exists = current.some((member) => member.id === savedMember.id);
      return sortMembers(
        exists
          ? current.map((member) => member.id === savedMember.id ? savedMember : member)
          : [...current, savedMember],
      );
    });
    setMemberError('');
  };

  const handleMemberDeleted = (memberId) => {
    setMembers((current) => current.filter((member) => member.id !== memberId));
    setMemberError('');
  };

  return (
    <>
      <PageHero eyebrow="ABOUT BAND" title="청운밴드" description="미르와 함께 무대의 사운드를 완성해 온 청운밴드를 소개합니다." />

      <section className="section-wrap band-intro">
        <div className="band-intro-copy">
          <span className="soft-label">CHEONGWOON BAND</span>
          <h2>
            {taglineBefore}
            <strong>{BAND_TAGLINE_HIGHLIGHT}</strong>
            {taglineAfter}
          </h2>
        </div>
        <figure className="band-intro-visual">
          <img
            src={CHEONGWOON_HERO_IMAGE}
            alt="청운밴드 대표 일러스트"
            decoding="async"
          />
        </figure>
      </section>

      <section className="section-wrap member-section">
        <div className="member-section-heading">
          <div className="section-title">
            <span>MEMBERS</span>
            <h2>밴드 멤버</h2>
            <p>사진, 포지션, 한 줄 코멘트로 각 멤버를 소개합니다.</p>
          </div>

          {isAdmin && (
            <div className="band-admin-toolbar">
              <span><ShieldCheck size={14}/> 관리자 편집 모드</span>
              <button type="button" className="btn btn-primary" onClick={() => setAddingMember(true)}>
                <Plus size={16}/> 멤버 추가
              </button>
            </div>
          )}
        </div>

        {!isSupabaseConfigured && (
          <div className="setup-banner">Supabase 연결이 필요합니다.</div>
        )}
        {memberError && <div className="admin-message">{memberError}</div>}

        {loadingMembers ? (
          <div className="loading">밴드 멤버를 불러오는 중...</div>
        ) : members.length ? (
          <div className="member-grid">
            {members.map((member) => (
              <article className="member-card" key={member.id}>
                <div className={`member-photo-wrap${member.image_path ? '' : ' is-illustration'}`}>
                  <img
                    className="member-photo"
                    src={memberVisuals[member.id] || DEFAULT_MEMBER_IMAGE}
                    alt={member.image_path ? `${member.name} 프로필 사진` : `${member.name} 밴드 멤버 일러스트`}
                    loading="lazy"
                    onError={handleMemberImageError}
                  />
                  {isAdmin && (
                    <button
                      type="button"
                      className="band-member-edit-overlay"
                      onClick={() => setEditingMember(member)}
                      aria-label={`${member.name} 멤버 수정`}
                    >
                      <Pencil size={15}/> 수정
                    </button>
                  )}
                </div>
                <div className="member-copy">
                  <span>{member.position}</span>
                  <h3>{member.name}</h3>
                  <p>{member.comment}</p>
                  {isAdmin && (
                    <small className="band-member-sort-label">표시 순서 {member.sort_order}</small>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h2>등록된 밴드 멤버가 없습니다.</h2>
            <p>{isAdmin ? '멤버 추가 버튼으로 첫 멤버를 등록해 주세요.' : '밴드 멤버 정보를 준비 중입니다.'}</p>
          </div>
        )}
      </section>

      {(addingMember || editingMember) && isAdmin && (
        <BandMemberEditor
          member={editingMember}
          defaultSortOrder={defaultSortOrder}
          onClose={() => {
            setAddingMember(false);
            setEditingMember(null);
          }}
          onSaved={handleMemberSaved}
          onDeleted={handleMemberDeleted}
        />
      )}
    </>
  );
}
