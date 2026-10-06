/** An unavailable deletion list must never make deleted static songs reappear. */
export function visibleSongs(songs, deletions) {
  if (!Array.isArray(deletions)) return [];
  const hidden = new Set(deletions.map(row => row.song_id));
  return songs.filter(song => !hidden.has(song.id));
}
export function deletionResult(result, id, status) {
  if (result?.error) {
    const code = result.error.code;
    throw Error(code === '42501' ? '관리자 권한을 확인해 주세요.' : code === '40001'
      ? '다른 화면에서 변경되었습니다. 새로고침한 뒤 다시 확인해 주세요.'
      : '처리하지 못했습니다. 연결과 권한을 확인한 뒤 다시 시도해 주세요.');
  }
  if (result?.data?.status !== status || result.data.song_id !== id) {
    throw Error('처리 결과를 확인하지 못했습니다. 새로고침 후 상태를 확인해 주세요.');
  }
  return result.data;
}
