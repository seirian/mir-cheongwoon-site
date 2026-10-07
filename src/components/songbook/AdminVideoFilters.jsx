import {videoPresenceFilters} from '../../lib/songbookVideoPresence.js';
import {VideoMark} from './SongMedia';
import '../../songbook-video-filters.css';

export default function AdminVideoFilters({params, onChange, disabled=false, partial=false}) {
  const filters = videoPresenceFilters(params, true);
  return <fieldset className="sb-video-filters" disabled={disabled}>
    <legend>연결 영상 조건 <small>관리자 전용</small></legend>
    <div className="sb-video-filter-options">
      {[['youtube','YouTube'],['soop','SOOP']].map(([key,label]) => <label key={key}>
        <span><VideoMark platform={key}/>{label} 링크</span>
        <select aria-label={`${label} 링크 유무`} value={filters[key]} onChange={e=>onChange({[key]:e.target.value, song:''})}>
          <option value="">전체</option><option value="present">있음</option><option value="missing">없음</option>
        </select>
      </label>)}
      <button type="button" className="sb-button" disabled={!filters.youtube&&!filters.soop} onClick={()=>onChange({youtube:'',soop:'',song:''})}>영상 조건 초기화</button>
    </div>
    <p className="sb-note">YouTube ‘없음’을 선택하면 유튜브 링크를 추가할 곡을 찾을 수 있습니다. 두 조건은 함께 적용되며, 직접 입력한 영상과 자동 수집으로 연결된 영상을 모두 포함합니다. 공식 영상·재생 가능 여부가 아닌 링크 등록 유무를 확인합니다.</p>
    {partial&&<p className="sb-auto-warning" role="status">자동 수집 영상 조회가 지연되어 현재 불러온 링크만 기준으로 표시합니다.</p>}
  </fieldset>;
}
