import {vodInfo} from './songbookMedia.js';

/** Use the same validated URLs as the rendered icons, including merged timeline URLs. */
export function videoPresence(song) {
  const present = {youtube:false, soop:false};
  for (const url of Array.isArray(song?.videoUrls) ? song.videoUrls : []) {
    const info = vodInfo(url);
    if (info) present[info.platform] = true;
  }
  return present;
}
export function videoPresenceFilters(params, admin = false) {
  const read = key => admin === true && ['present','missing'].includes(params.get(key)) ? params.get(key) : '';
  return {youtube:read('youtube'), soop:read('soop')};
}
/** Apply BEFORE pagination/export. Non-admin URL parameters are intentionally ignored. */
export function filterVideoPresence(songs, params, admin = false) {
  const filters = videoPresenceFilters(params, admin);
  if (!filters.youtube && !filters.soop) return songs;
  return songs.filter(song => {
    const present = videoPresence(song);
    return Object.entries(filters).every(([platform, value]) => !value || present[platform] === (value === 'present'));
  });
}
