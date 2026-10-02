/** Public search presentation and operator-owned display names. No collection provenance. */
import {artworkFields, musicUrl} from './songbookMedia.js';
import {normalize} from './songbookV2.js';
const ko = value => /[가-힣]/u.test(String(value || ''));
const statuses = new Set(['reviewed-ko', 'catalog-ko', 'alias-ko', 'original']);
export function recordingKey(row) {
  const url = musicUrl(row.musicUrl || row.music_url || '');
  const id = url && new URL(url).searchParams.get('i');
  return id ? `itunes:${id}` : /^musicbrainz:[a-f\d-]{36}$/.test(row.key || '') ? row.key : '';
}
export function versionLabel(title = '') {
  const markers = [...title.matchAll(/[\(\[（]([^\)\]）]+)[\)\]）]|\s[-–—]\s(.+)$/gu)].map(m => (m[1] || m[2])).join(' ');
  if (/\b(inst\.?|instrumental|karaoke|MR)\b|반주/iu.test(markers)) return '반주';
  if (/\blive\b|라이브|실황/iu.test(markers)) return '라이브';
  if (/\bremix\b|리믹스/iu.test(markers)) return '리믹스';
  if (/\bremaster(?:ed)?\b|리마스터/iu.test(markers)) return '리마스터';
  if (/(english|japanese|korean|chinese|한국어|일본어|영어)\s*(ver\.?|version|버전)/iu.test(markers)) return '언어별 버전';
  return '';
}
export function mergedAliases(values, title = '') {
  const seen = new Set([normalize(title)]), aliases = [];
  for (const value of values) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 100 || seen.has(normalize(value))) continue;
    aliases.push(value.trim()); seen.add(normalize(value));
    if (aliases.length === 20) break;
  }
  return aliases;
}
export function existingMatch(songs, result) {
  const key = recordingKey(result);
  if (key) {
    const exact = songs.filter(s => recordingKey(s) === key);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return undefined;
  }
  const names = [result.title, ...(result.aliases || [])].map(normalize);
  const candidates = songs.filter(s => {
    // Two different known recordings must not become one just because their titles match.
    const storedKey = recordingKey(s);
    if (key && storedKey && key !== storedKey) return false;
    return normalize(s.artist) === normalize(result.artist) && versionLabel(s.title) === versionLabel(result.title)
      && names.includes(normalize(s.title));
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}
export function searchRows(rows, songs = []) {
  return rows.filter(r => r && typeof r.title === 'string' && r.title.trim() && typeof r.artist === 'string' && r.artist.trim())
    .map(r => {
      const row = {...artworkFields(r), key:recordingKey(r), title:r.title.slice(0,200), artist:r.artist.slice(0,200),
        aliases:mergedAliases(Array.isArray(r.aliases) ? r.aliases : [],r.title), releaseDate:typeof r.releaseDate === 'string' ? r.releaseDate.slice(0,10) : '',
        duration:Number.isFinite(r.duration) && r.duration > 0 && r.duration < 86400000 ? r.duration : 0,
        titleStatus:statuses.has(r.titleStatus) ? r.titleStatus : ko(r.title) ? 'catalog-ko' : 'original'};
      const found = existingMatch(songs, row);
      return found ? {...row, title:found.title, artist:found.artist, titleStatus:'saved', existingId:found.id,
        suggestedTitle:ko(row.title) && row.title !== found.title ? row.title : '',
        aliases:mergedAliases([...(found.aliases || []),row.title,...row.aliases],found.title)} : row;
    });
}
export function selectionDraft(found, result, blank) {
  // Metadata imports never overwrite an operator's title, ratings, categories or VOD choices.
  if (!found) return {...blank, ...artworkFields(result), title:result.title, artist:result.artist, aliases:result.aliases || []};
  return {...found, ...(result.artworkUrl ? artworkFields(result) : {}), album:result.album || found.album,
    aliases:mergedAliases([...(found.aliases || []), result.title, ...(result.aliases || [])], found.title)};
}
export function titleLabel(row) {
  if (row.titleStatus === 'saved') return '등록한 제목';
  if (ko(row.title)) return '한국어 제목';
  return ko(row.artist) ? '원문 제목 · 한국어명 미확인' : '원문 제목';
}
export function durationLabel(milliseconds) {
  if (!milliseconds) return '';
  const seconds = Math.round(milliseconds/1000);
  return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}
