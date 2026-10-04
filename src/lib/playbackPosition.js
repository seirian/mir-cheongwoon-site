/** VOD elapsed positions, not wall-clock times. The API still stores integer seconds. */
export const MAX_PLAYBACK_SECONDS = 172800;

export function formatPlaybackPosition(seconds) {
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > MAX_PLAYBACK_SECONDS) return '';
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
}

export function parsePlaybackPosition(value) {
  const invalid = error => ({ seconds: null, error });
  if (typeof value !== 'string' || value.length > 32) {
    return invalid('시:분:초(01:12:30) 또는 분:초(03:20)로 입력해 주세요.');
  }
  const text = value.normalize('NFKC').trim();
  if (!text) return invalid('VOD에서 노래가 시작되는 위치를 입력해 주세요.');
  // No bare numbers: a value such as 120 must not silently mean seconds or minutes.
  const parts = text.split(':');
  if (![2, 3].includes(parts.length) || !/^\d{1,4}$/.test(parts[0]) ||
      parts.slice(1).some(part => !/^\d{1,2}$/.test(part))) {
    return invalid('시:분:초(01:12:30) 또는 분:초(03:20)로 입력해 주세요.');
  }
  const values = parts.map(Number);
  const [hours, minutes, seconds] = values.length === 3 ? values : [0, ...values];
  if (seconds > 59 || (values.length === 3 && minutes > 59)) {
    return invalid('초와 시:분:초 형식의 분은 0~59로 입력해 주세요.');
  }
  const total = hours * 3600 + minutes * 60 + seconds;
  if (total > MAX_PLAYBACK_SECONDS) return invalid('시작 위치는 00:00:00~48:00:00 범위로 입력해 주세요.');
  return { seconds: total, error: '' };
}
