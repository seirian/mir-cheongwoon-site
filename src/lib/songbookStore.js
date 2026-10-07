import {visibleSongs, deletionResult} from './songbookDeletion.js';
import { timelineSongs } from './songbookTimeline.js';
import { songbookEditAccess } from './songbookAccess.js';
import { supabase } from './supabase';
import { IS_REVIEW_PREVIEW, IS_SONGBOOK_PREVIEW } from './preview';
import { songbookTables } from './usernameLogin';
import { createClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import catalog from '../data/songbookCatalog.json';
import { DEMO_KEY, duplicateOf, mergeSongs, publicSong, restrictedFetch, stars, validateEntry } from './songbookV2';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
let storage;
try { storage = window.sessionStorage; } catch { storage = undefined; }
export const songbookClient = !IS_REVIEW_PREVIEW ? supabase : IS_SONGBOOK_PREVIEW && url && key ? createClient(url, key, {
  auth: { storageKey: 'mir-songbook-review-editor-v2', storage, persistSession: Boolean(storage), autoRefreshToken: true, detectSessionInUrl: false },
  global: { fetch: restrictedFetch(url, globalThis.fetch.bind(globalThis)) },
}) : null;
const tables = songbookTables(IS_SONGBOOK_PREVIEW);
async function readTable(name, columns = '*', orderField = name === tables.ratings ? 'song_id' : 'id') {
  let data = [];
  for (let page = 0; page < 20; page++) {
    const response = await songbookClient.from(name).select(columns).order(orderField).range(page * 500, page * 500 + 499);
    if (response.error) throw response.error;
    data = data.concat(response.data);
    if (response.data.length < 500) return data;
  }
  throw Error('목록이 너무 큽니다.');
}
export function useSongbookStore(demo) {
  const [entries, setEntries] = useState([]);
  const [deletions, setDeletions] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [automatic, setAutomatic] = useState([]);
  const [media, setMedia] = useState([]);
  const [autoError, setAutoError] = useState('');
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [authChecking, setAuthChecking] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const authGeneration = useRef(0);
  const readGeneration = useRef(0);
  const writeLock = useRef(false);
  const mode = useRef(demo);
  mode.current = demo;

  const refresh = useCallback(async () => {
    if (demo) return;
    const generation = ++readGeneration.current;
    setError('');
    try {
      if (!songbookClient) throw Error('No configuration');
      const [e, r, a, d] = await Promise.all([readTable(tables.entries), readTable(tables.ratings),
        IS_REVIEW_PREVIEW ? Promise.resolve({rows:[],media:[]}) : Promise.all([readTable('songbook_auto_entries'),readTable('songbook_auto_media')]).then(([rows,media])=>({rows,media})).catch(()=>null),
        IS_REVIEW_PREVIEW ? Promise.resolve([]) : readTable('songbook_deletions','song_id','song_id')]);
      if (mode.current || generation !== readGeneration.current) return;
      setEntries(e); setRatings(r); setDeletions(d); setReady(true);
      if(a){setAutomatic(a.rows);setMedia(a.media);setAutoError('');}
      else setAutoError('자동 갱신 목록을 불러오지 못했습니다. 기존 목록과 수동 편집은 계속 사용할 수 있습니다.');
    } catch {
      if (mode.current || generation !== readGeneration.current) return;
      setReady(false); setEntries([]); setRatings([]);
      setError('저장된 변경사항과 삭제 상태를 불러오지 못했습니다. 다시 불러오기를 눌러 주세요. 서버 편집은 잠시 중지됩니다.');
    }
  }, [demo]);

  useEffect(() => {
    setEntries([]); setRatings([]); setDeletions(IS_REVIEW_PREVIEW ? [] : null); setAutomatic([]); setMedia([]); setAutoError(''); setReady(false); setError('');
    if (demo) {
      try {
        const value = JSON.parse(localStorage.getItem(DEMO_KEY) || '{}');
        const e = Array.isArray(value.entries) ? value.entries : [];
        const r = Array.isArray(value.ratings) ? value.ratings : [];
        // Stored entries use database field names. Normalize before validating so videos/status survive reload.
        setEntries(e.map(entry => validateEntry(publicSong(entry))));
        setRatings(r.filter(row => typeof row.song_id === 'string' && (row.proficiency === null || stars(row.proficiency))));
      } catch { setError('체험 저장 데이터를 읽지 못해 기본 목록으로 시작합니다.'); }
      setReady(true);
    } else refresh();
    return () => { ++readGeneration.current; };
  }, [demo, refresh]);

  useEffect(() => {
    setRole(null); setAdmin(false); setAuthChecking(false);
    if (!songbookClient || demo) return undefined;
    let active = true, accountId = null;
    const resolve = next => {
      if (!active) return;
      const generation = ++authGeneration.current;
      const nextId = next?.user?.id || null;
      // A refocus/refresh event for the same account is not a logout. Keep the
      // verified UI mounted; disable writes while rechecking server permission.
      if (nextId !== accountId || !nextId) { setRole(null); setAdmin(false); }
      accountId = nextId; setSession(next); setAuthChecking(Boolean(nextId));
      if (!nextId) return;
      setTimeout(async () => {
        if (!active || generation !== authGeneration.current) return;
        let verifiedAdmin = false, verifiedRole = null;
        try {
          const user = await songbookClient.auth.getUser();
          if (!user.error && user.data.user?.id === nextId) {
            const [a, e] = await Promise.all([
              songbookClient.from('admins').select('user_id').eq('user_id', nextId).maybeSingle(),
              IS_SONGBOOK_PREVIEW ? songbookClient.from(tables.editors).select('role').eq('user_id', nextId).maybeSingle() : Promise.resolve({ data: null, error: null }),
            ]);
            if (!a.error && !e.error) { verifiedAdmin = Boolean(a.data); verifiedRole = e.data?.role || null; }
          }
        } catch { /* Fail closed on a completed failed verification. */ }
        if (active && generation === authGeneration.current) {
          setAdmin(verifiedAdmin); setRole(verifiedRole); setAuthChecking(false);
        }
      }, 0);
    };
    const initialGeneration = authGeneration.current;
    songbookClient.auth.getSession().then(({ data }) => {
      if (active && initialGeneration === authGeneration.current) resolve(data.session);
    }).catch(() => {});
    const { data } = songbookClient.auth.onAuthStateChange((_event, next) => resolve(next));
    return () => { active = false; ++authGeneration.current; data.subscription.unsubscribe(); };
  }, [demo]);

  const songs = visibleSongs(timelineSongs(catalog, entries, ratings, automatic, media), IS_REVIEW_PREVIEW ? [] : deletions);
  const { canEdit, canRate } = songbookEditAccess({ ready: ready && !authChecking, admin, role, demo, reviewPreview: IS_REVIEW_PREVIEW, songbookPreview: IS_SONGBOOK_PREVIEW });
  const canDelete = canEdit && admin && !IS_REVIEW_PREVIEW;
  async function deleteSong(id) {
    if (!canDelete || writeLock.current || !songs.some(s=>s.id===id)) throw Error('삭제할 곡과 관리자 권한을 확인해 주세요.');
    writeLock.current=true; setSaving(true);
    try {
      const result=await songbookClient.rpc('songbook_delete',{p_song_id:id,p_expected_revision:entries.find(e=>e.id===id)?.revision||0});
      deletionResult(result,id,'deleted');
      ++readGeneration.current;
      setDeletions(old=>[...(old||[]).filter(d=>d.song_id!==id),{song_id:id}]);
      return id;
    } finally {writeLock.current=false;setSaving(false);}
  }
  async function restoreSong(row) {
    if (!canDelete || writeLock.current) throw Error('관리자 권한을 확인해 주세요.');
    writeLock.current=true;setSaving(true);
    try {
      const result=await songbookClient.rpc('songbook_restore',{p_song_id:row.song_id,p_delete_token:row.delete_token});
      deletionResult(result,row.song_id,'restored');
      ++readGeneration.current;
      await refresh();
      return row.song_id;
    } finally {writeLock.current=false;setSaving(false);}
  }
  function persist(e, r) {
    localStorage.setItem(DEMO_KEY, JSON.stringify({ entries: e, ratings: r }));
    setEntries(e); setRatings(r);
  }
  async function write(table, idField, payload, previous) {
    const query = songbookClient.from(table);
    const result = previous
      ? await query.update(payload).eq(idField, payload[idField]).eq('revision', previous.revision).select().single()
      : await query.insert(payload).select().single();
    if (result.error) throw Error(result.error.code === '23505' ? '같은 곡이 이미 등록되었거나 갱신이 충돌했습니다. 삭제한 노래에도 같은 곡이 있는지 확인해 주세요.' : result.error.code === 'PGRST116' ? '다른 화면에서 변경되었습니다. 새로고침 후 다시 저장해주세요.' : '저장하지 못했습니다. 권한·입력값·연결을 확인해주세요.');
    return result.data;
  }
  async function saveSong(input) {
    if (!canEdit || writeLock.current) throw Error('편집 권한이 없거나 저장 중입니다.');
    const previous = entries.find(e => e.id === input.id);
    if (Object.hasOwn(input,'expectedRevision') && (previous?.revision||0)!==input.expectedRevision) throw Error('다른 화면에서 변경되었습니다. 창을 닫고 다시 불러온 뒤 저장해 주세요.');
    const payload = validateEntry({ ...input, id: input.id || 'custom-' + crypto.randomUUID() }, {allowUnknownArtist: !IS_REVIEW_PREVIEW});
    if (duplicateOf(songs, payload)) throw Error('같은 곡이 이미 있습니다. 기존 곡을 편집해주세요.');
    writeLock.current = true; setSaving(true);
    try {
      if (demo) persist([...entries.filter(e => e.id !== payload.id), payload], ratings);
      else {
        const saved = await write(tables.entries, 'id', payload, previous);
        if (!mode.current) setEntries(old => [...old.filter(e => e.id !== saved.id), saved]);
      }
      return payload.id;
    } finally { writeLock.current = false; setSaving(false); }
  }
  async function saveRating(id, value) {
    if (!canRate || writeLock.current) throw Error('숙련도 편집 권한이 없거나 저장 중입니다. 관리자 로그인 상태를 확인해 주세요.');
    if (!songs.some(s => s.id === id) || (value !== null && !stars(value))) throw Error('숙련도를 확인해주세요.');
    writeLock.current = true; setSaving(true);
    try {
      const payload = { song_id: id, proficiency: value };
      if (demo) persist(entries, [...ratings.filter(r => r.song_id !== id), payload]);
      else {
        const saved = await write(tables.ratings, 'song_id', payload, ratings.find(r => r.song_id === id));
        if (!mode.current) setRatings(old => [...old.filter(r => r.song_id !== id), saved]);
      }
    } finally { writeLock.current = false; setSaving(false); }
  }
  return { songs, revisionFor:id=>entries.find(e=>e.id===id)?.revision||0, session, role, admin, authChecking, ready, error, autoError, saving, canEdit, canRate, canDelete, deleteSong, restoreSong, saveSong, saveRating, refresh, client: songbookClient };
}
