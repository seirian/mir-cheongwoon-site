import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowDownToLine, ClipboardCheck } from 'lucide-react';
import snapshot from '../data/songbookData.json';
import cafe from '../data/songbookCafeFindings.json';
import { downloadFile, normalize, toCsv } from '../lib/songbook';
import { SourceLink } from './SongbookPage';
import '../songbook.css';

const checks = ['검색·초성·다국어 별칭 검색 결과가 자연스러운가요?', '모바일에서 곡명·가수·분류와 버튼이 잘 보이나요?', '원본 출처, 가창 영상, MR이 구분되어 있나요?', '중복 후보와 가수 표기 충돌을 검토했나요?', '신청 가능 여부와 난이도를 미르님이 확인할 수 있나요?', '미리내 게시물 본문·영상 검증과 누락 기간 조사를 이어갈 수 있나요?'];
const groups = new Map();
for (const song of snapshot.songs) {
  const key = normalize(song.title);
  groups.set(key, [...(groups.get(key) || []), song]);
}
const conflicts = [...groups.values()].filter(group => new Set(group.map(song => song.artist)).size > 1);

export default function SongbookReviewPage() {
  const [checked, setChecked] = useState([]);
  const { audit } = snapshot;
  return <div className="section-wrap sb-review">
    <Link className="sb-button" to="/songbook"><ArrowLeft size={16}/>노래책으로 돌아가기</Link>
    <span className="sb-overline" style={{marginTop:28}}><ClipboardCheck size={16}/> SONGBOOK REVIEW · 01</span>
    <h1>노래책 1차 검토실</h1>
    <p><code>feature/songbook</code> 초안입니다. 운영 데이터베이스를 수정하지 않는 정적 목록과 브라우저 즐겨찾기로 기능을 먼저 검토합니다. 검토 체크는 이 화면에서만 유지되며, 승인·신청 접수·배포를 실행하지 않습니다.</p>
    <div className="sb-actions"><button type="button" className="sb-button" onClick={() => downloadFile(toCsv(snapshot.songs), 'text/csv;charset=utf-8', 'mir-songbook-all.csv')}><ArrowDownToLine size={15}/>전체 목록 CSV</button><button type="button" className="sb-button" onClick={() => downloadFile(JSON.stringify({...snapshot,cafeFindings:cafe}, null, 2), 'application/json', 'mir-songbook-source-review.json')}><ArrowDownToLine size={15}/>출처 포함 JSON</button></div>
    <section><h2>이번에 확보한 자료</h2><p>{snapshot.snapshotDate} 수집 · 원본 {audit.inputRows}개 항목 → 대조 후 {audit.catalogEntries}개 곡 항목. {audit.crossListedCount}개는 두 목록에 함께 등재되어 있습니다. 같은 원본을 공유할 수 있어 독립적인 가창 검증으로 간주하지 않습니다.</p>{snapshot.sources.map(source => <div className="sb-audit-row" key={source.id}><SourceLink url={source.url}>{source.name}</SourceLink><span>{source.status}</span><strong>{source.importedCount}항목</strong></div>)}<p>미리내의 0항목은 자료가 없다는 뜻이 아니라, 본문 검증을 거쳐 본 목록에 확정 반영한 항목이 아직 없다는 뜻입니다. 공개 검색에서 찾은 후보는 아래에 별도로 기록했습니다.</p></section>
    <section><h2>미리내 검색에서 찾은 검토 대상</h2><p>{cafe.coverage} {cafe.status} 게시일을 실제 가창일로 옮기지 않았으며, 합방 글의 다른 보컬 곡을 미르님의 곡으로 등록하지 않았습니다.</p><div className="sb-source-links">{cafe.findings.map(item => <SourceLink key={item.articleId} url={item.url}><span><strong>{item.title}</strong><small>게시일 {item.publishedAt} · {item.kind} · 본문 대조 전</small></span></SourceLink>)}</div><p>{cafe.originalSongbookAccess}</p><SourceLink url={cafe.originalSongbookUrl}>카페 메뉴에 연결된 기존 노래책</SourceLink></section>
    <section><h2>수록 기준과 남은 확인</h2><div className="sb-check-grid"><article><h3>조사 기간 ≠ 검증 완료 기간</h3><p>{snapshot.scope.from}부터 {snapshot.scope.through}까지를 조사 대상으로 잡았습니다. 수집본은 {snapshot.snapshotDate} 기준이며, 각 곡의 기간 내 가창 여부·최초 가창일은 확인 전입니다.</p></article><article><h3>신청 가능 여부는 별도 승인</h3><p>모든 곡의 신청 상태는 ‘미르님 확인 전’입니다. 원본의 적응도·키는 출처 정보로만 보존하고, 난이도·숙련도를 임의 평가하지 않았습니다.</p></article><article><h3>중복은 보수적으로 정리</h3><p>{audit.mergeRule} 정규화한 원본 표기는 곡 상세에 남겼습니다.</p></article><article><h3>MR과 가창 영상은 분리</h3><p>잘못된 링크 {audit.invalidLinkCount}개를 제외했습니다. ‘영상 있는 곡’은 유효한 형식의 연결 주소가 있다는 뜻이며, 현재 재생이나 실제 가창이 모두 검증됐다는 뜻은 아닙니다.</p></article></div></section>
    <section><h2>가수 표기가 다른 동명 항목</h2><p>아래 항목은 자동으로 합치지 않았습니다. 실제 같은 곡인지, 원곡자·작품 표기가 무엇인지 확인한 뒤 병합할 수 있습니다.</p>{conflicts.length ? <div className="sb-table-wrap"><table><thead><tr><th>곡명</th><th>각 항목의 가수·작품 표기</th></tr></thead><tbody>{conflicts.map(group => <tr key={group[0].id}><td>{group[0].title}</td><td>{group.map((song, index) => <span key={song.id}>{index > 0 && ' / '}<Link to={`/songbook?song=${encodeURIComponent(song.id)}`}>{song.artist} ↗</Link></span>)}</td></tr>)}</tbody></table></div> : <p>현재 표기 기준으로 발견된 충돌은 없습니다.</p>}</section>
    <section><h2>화면에서 확인해 주세요</h2>{checks.map((label, index) => <label className="sb-review-check" key={label}><input type="checkbox" checked={checked.includes(index)} onChange={() => setChecked(old => old.includes(index) ? old.filter(value => value !== index) : [...old,index])}/><span>{label}</span></label>)}<small>{checked.length}/{checks.length}개 확인 · 이 체크는 관리자 승인 상태를 변경하지 않습니다.</small></section>
    <section><h2>이번 초안의 범위</h2><p>검색·필터·정렬·페이지 나누기·곡 상세·출처 확인·곡 정보 복사·브라우저 즐겨찾기·CSV/JSON 내보내기를 제공합니다. 관리자 편집, 신청곡 대기열, 로그인 계정 간 즐겨찾기 동기화, 자동 수집 배치와 전 기간 가창 아카이브는 이번 초안에 포함하지 않았습니다.</p><p>확인되지 않은 날짜·공연 순서·타임스탬프·신청 가능 상태를 만들어 넣지 않았습니다. ‘전곡 수록 완료’로 표시하지 않습니다.</p></section>
  </div>;
}
