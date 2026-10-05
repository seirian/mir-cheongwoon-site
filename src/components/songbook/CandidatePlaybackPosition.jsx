import {candidatePlaybackPosition} from '../../lib/candidatePlaybackPosition.js';
import {timelineUrl} from '../../lib/songbookTimeline.js';
import PlaybackPositionInput from './PlaybackPositionInput.jsx';
import '../../songbook-position-reference.css';

/** Show why the draft was prefilled (or left empty) without rewriting user input. */
export default function CandidatePlaybackPosition({candidate,value,onChange,disabled=false}) {
  const context = candidatePlaybackPosition(candidate);
  const referenceUrl = context.referenceSeconds === null ? null
    : timelineUrl(candidate.vod_id, context.referenceSeconds);
  return <div className="sb-candidate-position" data-position-kind={context.kind}>
    {context.kind === 'section' ? <div className="sb-position-reference" role="note" aria-label="수집된 참고 위치 안내">
      <div className="sb-position-reference-heading">
        <strong>수집된 참고 위치: <span>{context.referencePosition || '확인할 수 없음'}</span></strong>
        <small>곡별 시작점 미확인</small>
      </div>
      <p>여러 노래를 묶은 구간의 시작 위치입니다. 이 곡의 정확한 시작점은 아직 확인되지 않아 입력칸을 비워 두었습니다.</p>
      {referenceUrl && <a className="sb-button" href={referenceUrl} target="_blank" rel="noopener noreferrer">참고 위치에서 VOD 확인 ↗</a>}
      <p className="sb-position-reference-help">{referenceUrl ? '위 참고 위치에서 영상을 확인한 뒤, 아래에 이 곡이 실제로 시작되는 위치를 입력해 주세요.' : 'VOD를 확인한 뒤 아래에 이 곡이 실제로 시작되는 위치를 입력해 주세요.'}</p>
    </div> : <p className="sb-note sb-position-origin">
      {context.kind === 'confirmed' ? '이전에 확인해 저장한 시작 위치를 불러왔습니다. 필요한 경우에만 수정해 주세요.'
        : context.kind === 'collected' ? '수집한 시작 위치를 자동 입력했습니다. VOD에서 미르님의 가창 시작점을 확인하고, 다른 경우에만 수정해 주세요.'
        : '자동 입력할 수 있는 시작 위치가 없습니다. VOD를 확인한 뒤 아래에 시작 위치를 입력해 주세요.'}
    </p>}
    <PlaybackPositionInput value={value} onChange={onChange} vodId={candidate.vod_id} disabled={disabled}/>
  </div>;
}
