import { getYouTubeVideoId } from './youtube.js';

export function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function canonicalVideoUrl(value, seconds = null) {
  const safe = safeExternalUrl(value);
  const id = getYouTubeVideoId(safe);
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) return '';
  const url = new URL(`https://www.youtube.com/watch?v=${id}`);
  if (Number.isInteger(seconds) && seconds >= 0) url.searchParams.set('t', `${seconds}s`);
  return url.href;
}

export function isPublishableMember(member) {
  if (!member || member.is_published === false || ['draft', 'hidden'].includes(member.status)) return false;
  const name = String(member.name || '').trim();
  const position = String(member.position || '').trim();
  const comment = String(member.comment || '').trim();
  return Boolean(name && position && comment
    && !/^(멤버|member)\s*\d+$/i.test(name)
    && !/^(position|포지션|미정)$/i.test(position)
    && !/입력하세요|준비\s*중|placeholder/i.test(comment));
}

export function selectEditorialVideo(pick, covers = [], recent = []) {
  const pinned = canonicalVideoUrl(pick.youtubeUrl);
  if (pinned) return { title: pick.title, youtube_url: pinned, pinned: true };
  const source = pick.source === 'recent' ? recent : covers;
  for (const term of pick.candidates || []) {
    const matched = source.find((video) => String(video.title || '').toLowerCase().includes(term.toLowerCase()) && canonicalVideoUrl(video.youtube_url));
    if (matched) return matched;
  }
  // This slot is explicitly labelled as recent channel content, not a fixed pick.
  return pick.source === 'recent' ? source.find((video) => canonicalVideoUrl(video.youtube_url)) || null : null;
}

export function getKstDateKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function getKstCivilDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(+values.year, +values.month - 1, +values.day, +values.hour, +values.minute, +values.second);
}

export function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(+date) && date.toISOString().slice(0, 10) === value;
}

export function getUpcomingEvents(events, now = new Date(), limit = 3) {
  const today = getKstDateKey(now);
  return events.filter((event) => {
    if (!isValidDateKey(event.event_date) || event.event_date < today || !String(event.title || '').trim()) return false;
    if (event.is_published === false || ['cancelled', 'canceled', 'draft'].includes(event.status)) return false;
    if (event.category === '휴방' || /휴방|휴뱅|취소|비공개|밴드\s*연습/.test(event.title)) return false;
    if (event.event_date === today && /^\d{2}:\d{2}/.test(event.start_time || '')) {
      return new Date(`${event.event_date}T${event.start_time.slice(0, 5)}:00+09:00`) >= now;
    }
    return true;
  }).sort((a, b) => a.event_date.localeCompare(b.event_date)
    || String(a.start_time || '99:99').localeCompare(String(b.start_time || '99:99'))
    || (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)).slice(0, limit);
}

export function formatEventDate(key) {
  if (!isValidDateKey(key)) return '';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${key}T12:00:00+09:00`));
}

const icsEscape = (text) => String(text || '').replaceAll('\\', '\\\\').replace(/\r\n|\r|\n/g, '\\n').replaceAll(';', '\\;').replaceAll(',', '\\,');
function foldLine(line) {
  const encoder = new TextEncoder();
  const lines = []; let current = ''; let bytes = 0;
  for (const character of line) {
    const length = encoder.encode(character).length;
    if (bytes + length > 75) { lines.push(current); current = ' '; bytes = 1; }
    current += character; bytes += length;
  }
  lines.push(current);
  return lines.join('\r\n');
}

export function buildCalendarIcs(event, now = new Date()) {
  if (!isValidDateKey(event?.event_date)) throw new Error('Invalid event date');
  const compact = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const date = event.event_date.replaceAll('-', '');
  const time = /^([01]\d|2[0-3]):[0-5]\d/.test(event.start_time || '') ? event.start_time.slice(0, 5).replace(':', '') + '00' : '';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MIR Cheongwoon Archive//Schedule//KO', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${encodeURIComponent(String(event.id || event.event_date + event.title))}@mir.yeop.net`, `DTSTAMP:${compact(now)}`];
  if (time) {
    const start = new Date(`${event.event_date}T${event.start_time.slice(0, 5)}:00+09:00`);
    lines.push(`DTSTART:${compact(start)}`);
    if (/^([01]\d|2[0-3]):[0-5]\d/.test(event.end_time || '')) {
      const end = new Date(`${event.event_date}T${event.end_time.slice(0, 5)}:00+09:00`);
      if (end <= start) end.setUTCDate(end.getUTCDate() + 1);
      lines.push(`DTEND:${compact(end)}`);
    }
  } else {
    const end = new Date(`${event.event_date}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${date}`, `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replaceAll('-', '')}`);
  }
  lines.push(`SUMMARY:${icsEscape(event.title)}`, `DESCRIPTION:${icsEscape([!time && '시작 시간 미정 (종일 일정으로 저장)', event.description, '팬 아카이브에 등록된 일정입니다. 변경 여부를 공식 공지에서 확인하세요.'].filter(Boolean).join('\n'))}`);
  const source = safeExternalUrl(event.link_url);
  if (source) lines.push(`URL:${source}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
