import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, ClipboardCheck, FileText, ShieldCheck } from 'lucide-react';
import { POLICY_REVIEW_DATE, POLICY_VERSION, policyBlockers, policyDocuments, policySources } from '../data/policyContent';
import PolicyLegalScope from '../components/PolicyLegalScope';
import '../policies.css';
import '../policyReviewAdditions.css';

function ReviewNotice() {
  return <aside className="policy-draft-notice" aria-label="검토안 상태">
    <strong>1차 검토안 · 정식 시행 전입니다</strong>
    <p>실제 코드·운영 DB와 법령을 대조한 초안입니다. 연락처, 보유기간, 국외 이전 세부사항, 탈퇴 절차가 확정되지 않아 정식 방침으로 사용할 수 없습니다. 회원가입이나 동의를 받는 페이지가 아닙니다.</p>
  </aside>;
}
function PolicyTable({ table }) {
  return <div className="policy-table-scroll" role="region" aria-label={table.headers.join(' / ')} tabIndex={0}>
    <table><thead><tr>{table.headers.map(header => <th scope="col" key={header}>{header}</th>)}</tr></thead>
      <tbody>{table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => j === 0 ? <th scope="row" key={j}>{cell}</th> : <td key={j}>{cell}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}
function Sources() {
  return <details className="policy-sources"><summary>판단 근거와 참고 자료</summary><p>검토 기준: {POLICY_REVIEW_DATE}. 아래 법령의 제2조·제15조·제21조·제22조의2·제26조·제28조의8·제30조·제35~38조·제58조 및 시행령 제31조 등을 대조했습니다. 적용 시점의 시행 법령과 실제 운영 상태를 함께 확인해야 합니다.</p><ul>{policySources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label} <span aria-hidden="true">↗</span></a></li>)}</ul></details>;
}
function SignupPreview() {
  return <section id="signup" className="policy-section">
    <div className="policy-section-heading"><span className="policy-kicker">SIGN-UP NOTICE</span><h2>회원가입 시점 안내 시안</h2></div>
    <p>푸터 문서와 별개로, 가입 버튼 바로 위에서 필수 처리 내용을 확인할 수 있게 하는 안입니다. 입력·전송·회원가입·동의 기록 저장은 모두 하지 않습니다.</p>
    <div className="policy-signup-demo" aria-label="회원가입 안내 시안">
      <div className="policy-demo-fields"><div><span>아이디</span><div>mir_fan_example</div></div><div><span>이메일</span><div>example@example.invalid</div></div><div><span>비밀번호</span><div>•••••••• <small>실제 입력란이 아닙니다</small></div></div></div>
      <div className="policy-signup-notice"><strong>계정 이용을 위한 개인정보 처리 안내</strong><p>아이디·이메일·비밀번호 인증정보로 회원을 구분하고, 로그인·이메일 인증·계정 복구를 처리합니다. 회원 식별값과 인증·세션 정보(IP·브라우저 정보 포함)도 생성됩니다.</p><p>Supabase를 사용하며 DB는 인도 리전에 저장됩니다. 보유기간·수탁자 세부사항·국외 이전 근거와 거부 방법은 정식 가입 안내 전 확정해야 합니다.</p><Link to="/policies/privacy">처리 항목과 미확정 사항 자세히 보기 <ArrowUpRight size={14}/></Link></div>
      <label className="policy-demo-check"><input type="checkbox" disabled /> <span>이용약관 동의 위치 예시 <Link to="/policies/terms">약관 보기</Link></span></label>
      <p className="policy-caption">개인정보처리방침 전체에 대한 포괄 동의는 넣지 않았습니다. 법 적용 범위와 처리 근거를 확인하고, 별도 동의가 필요한 처리를 구분해 최종 설계합니다. 연령 정책도 미확정입니다.</p>
      <button type="button" className="policy-demo-submit" disabled>검토용 · 회원가입을 받지 않습니다</button>
    </div>
  </section>;
}
function ReviewContent() {
  return <>
    <section className="policy-review-cards" aria-label="문서별 검토">
      {Object.entries(policyDocuments).map(([key, doc]) => <Link className="policy-review-card" key={key} to={`/policies/${key}`}><FileText size={22}/><h2>{doc.title}</h2><p>{key === 'privacy' ? '실제 처리 항목을 안내하는 초안. 자동 생성 정보와 국외 이전, 법 적용 범위를 포함합니다.' : key === 'terms' ? '계정과 서비스 이용 조건. 임의 면책이나 포괄 동의 없이 구성했습니다.' : '비공식 관계, 출처·저작권, 오류 수정과 요청 처리의 기준입니다.'}</p><span>초안 살펴보기 <ArrowUpRight size={16}/></span></Link>)}
    </section>
    <section id="findings" className="policy-section"><div className="policy-section-heading"><span className="policy-kicker">VERIFIED</span><h2>실제 확인한 내용</h2></div>
      <div className="policy-findings">
        <div><CheckCircle2 size={19}/><p><strong>세 가지 입력도 개인정보입니다.</strong><br/>아이디·이메일이 계정과 연결됩니다. 가입 코드에는 이메일 인증 및 복구 메일 처리도 있습니다.</p></div>
        <div><CheckCircle2 size={19}/><p><strong>화면 입력 외 정보도 생성됩니다.</strong><br/>운영 DB에 회원 UUID·가입 시각·인증정보가 있고, 세션 IP와 User-Agent의 실제 저장 여부를 집계로 확인했습니다.</p></div>
        <div><CheckCircle2 size={19}/><p><strong>DB 저장 위치는 인도입니다.</strong><br/>운영 Supabase 프로젝트 리전은 ap-south-1입니다. 모든 처리 국가를 뜻하지는 않으며, 국외 이전 세부 고지는 보완이 필요합니다.</p></div>
        <div><CheckCircle2 size={19}/><p><strong>기존 안내와 권리행사 경로는 보완 대상입니다.</strong><br/>가입 화면에 개인정보 안내가 없고, 계정 화면에는 비밀번호 변경·로그아웃만 확인했습니다. 탈퇴 대체 절차는 미확인입니다.</p></div>
      </div>
      <p className="policy-caption">확인 범위: develop f1602e78의 관련 소스와 운영 Supabase의 설정·스키마·최소 집계. 회원별 이메일, IP 원문, 비밀번호 해시, 토큰은 조회하지 않았습니다. 전체 보안 인증이나 모든 처리 흐름의 완전성 검증은 아닙니다.</p>
    </section>
    <section id="before-publish" className="policy-section"><div className="policy-section-heading"><span className="policy-kicker">BEFORE PUBLICATION</span><h2>정식 반영 전, 확정할 다섯 가지</h2></div><ol className="policy-blockers">{policyBlockers.map(item => <li key={item.title}><strong>{item.title}</strong><p>{item.detail}</p><span className="policy-status-chip">확정 필요</span></li>)}</ol></section>
    <SignupPreview/>
    <section id="preview-safety" className="policy-section"><div className="policy-section-heading"><span className="policy-kicker">REVIEW SCOPE</span><h2>이번 검토안의 범위</h2></div><p>기존 사이트의 공통 푸터에 세 문서를 연결했습니다. 로그인 없이 열람할 수 있고, 모바일과 데스크톱에서 같은 내용을 제공합니다. 위의 가입 화면은 안내 위치를 보여 주는 시안이며 실제 계정을 만들지 않습니다.</p><p>검토용 빌드는 운영 활성화와 분리하며 검색 노출을 막기 위한 noindex를 적용합니다. noindex는 접근통제가 아니므로 비밀정보나 회원정보를 게시하지 않습니다. 운영 회원·비밀번호·권한·DB 스키마를 변경하지 않습니다.</p><p>법 적용 범위를 판단하고 필요한 안내와 실제 운영 절차를 갖춘 뒤 별도 검토를 거쳐 정식 반영해야 합니다. 문서만 추가한다고 탈퇴·파기·국외 이전 문제가 자동으로 해결되지는 않습니다.</p></section>
    <Sources/>
  </>;
}
export default function PolicyPage() {
  const { document } = useParams();
  const isReview = document === 'review';
  const doc = Object.hasOwn(policyDocuments, document) ? policyDocuments[document] : null;
  if (!isReview && !doc) return <Navigate to="/policies/review" replace/>;
  const title = isReview ? '이용자 안내 1차 검토실' : doc.title;
  return <div className="policy-page">
    <header className="policy-hero">
      <div className="policy-hero-inner"><span className="policy-kicker">{isReview ? 'TRUST & TRANSPARENCY' : doc.eyebrow}</span><h1>{title}</h1><p className="policy-lead">{isReview ? '좋아하는 마음을 담은 사이트에, 안심할 수 있는 안내를 더합니다.' : doc.lead}</p><div className="policy-meta"><span><ShieldCheck size={15}/> {POLICY_VERSION}</span><span>검토 기준 {POLICY_REVIEW_DATE}</span><span>시행일 미정</span></div></div>
    </header>
    <div className="policy-content">
      <nav className="policy-tabs" aria-label="안내 문서"><Link to="/policies/review" aria-current={isReview ? 'page' : undefined}>검토실</Link>{Object.entries(policyDocuments).map(([key,item]) => <Link key={key} to={`/policies/${key}`} aria-current={document === key ? 'page' : undefined}>{key === 'operation' ? '운영정책' : item.title}</Link>)}</nav>
      <ReviewNotice/>
      {isReview ? <ReviewContent/> : <>
        <div className="policy-summary"><ClipboardCheck size={24}/><p>{doc.summary}</p></div>
        <nav className="policy-toc" aria-label="문서 목차"><strong>이 페이지에서 확인할 내용</strong><div>{doc.sections.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}</div></nav>
        <article className="policy-document">{doc.sections.map(section => <section className="policy-section" id={section.id} key={section.id}><h2>{section.title}</h2>{section.paragraphs?.map((text,i) => <p key={i}>{text}</p>)}{section.table && <PolicyTable table={section.table}/>} {section.pending && <div className="policy-pending"><strong>정식 반영 전 확인</strong><p>{section.pending}</p></div>}</section>)}</article>
        <Sources/>
        <div className="policy-end"><span>{POLICY_VERSION} / 검토 기준 {POLICY_REVIEW_DATE}</span><Link to="/policies/review#before-publish">남은 확인 사항 보기 <ArrowUpRight size={16}/></Link></div>
      </>}
      <PolicyLegalScope/>
    </div>
  </div>;
}
