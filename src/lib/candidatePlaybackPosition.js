import {formatPlaybackPosition} from './playbackPosition.js';

/** A section offset is a navigation hint, never a confirmed per-song position. */
export function candidatePlaybackPosition(candidate = {}) {
  const hasConfirmed = candidate.approved_seconds != null;
  const confirmed = formatPlaybackPosition(candidate.approved_seconds);
  const collected = formatPlaybackPosition(candidate.seconds);
  const sectionOnly = ['section_timestamp_only', 'already_listed_section'].includes(candidate.reason);
  const initialValue = hasConfirmed ? confirmed : sectionOnly ? '' : collected;
  const kind = hasConfirmed ? (confirmed ? 'confirmed' : 'missing')
    : sectionOnly ? 'section' : collected ? 'collected' : 'missing';
  return {
    initialValue,
    kind,
    referencePosition: kind === 'section' ? collected : '',
    referenceSeconds: kind === 'section' && collected ? candidate.seconds : null,
  };
}
