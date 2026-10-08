import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, ClipboardCheck, FileText, ShieldCheck } from 'lucide-react';
import { POLICY_REVIEW_DATE, POLICY_VERSION, policyBlockers, policyDocuments, policySources, policySignupNotice, policyRevisionChanges } from '../data/policyContent';
import PolicyLegalScope from '../components/PolicyLegalScope';
import '../policies.css';
import '../policyReviewAdditions.css';

function ReviewNotice() {
  return <aside className="policy-draft-notice" aria-label="검토안 상태">
    <strong>3차 검토안 · 정식 시행 전입니다</strong>
    <p>계정정보의 처리 근거와 이메일 용도 제한을 명시하고, 현재 가입에 연령 확인·보호자 인증을 일률적인 필수사항으로 요구하지 않는 안입니다. 운영 탈퇴 API와 별도 로그·백업·SMTP 등 미확정 사항은 남아 있습니다. 실제 회원가입이나 동의를 받는 페이지가 아닙니다.</p>
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
  return <details className="policy-sources"><summary>판단 근거와 참고 자료</summary><p>검토 기준: {POLICY_REVIEW_DATE}. 이번 변경의 중심은 제15조제1항제4호의 필요성, 제22조제3항의 항목·근거 고지, 제22조의2의 적용 조건입니다. 기존 위탁·국외 이전·파기·친목단체 예외 검토는 별도로 유지합니다. 개별 유권해석이나 전체 준법 인증이 아니며 실제 운영 내용과 법 적용 요건이 일치해야 합니다.</p><ul>{policySources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label} <span aria-hidden="true">↗</span></a></li>)}</ul></details>;
}
function SignupPreview() {
  return <section id="signup" className="policy-section">
    <div className="policy-section-heading"><span className="policy-kicker">SIGN-UP NOTICE · REVIEW 03</span><h2>회원가입 시점 안내 시안</h2></div>
    <p>가입 버튼 바로 위에서 계정정보의 목적·처리 근거·보유기간을 읽는 구조입니다. 생년월일·연령 확인·보호자 정보 입력을 추가하지 않습니다. 아래는 표시 예시로, 입력·전송·회원가입·동의 기록 저장은 모두 하지 않습니다.</p>
    <div className="policy-signup-demo" aria-label="회원가입 안내 시안">
      <div className="policy-demo-fields"><div><span>아이디</span><div>mir_fan_example</div></div><div><span>이메일</span><div>example@example.invalid</div></div><div><span>비밀번호</span><div>•••••••• <small>실제 입력란이 아닙니다</small></div></div></div>
      <div className="policy-signup-notice"><strong>{policySignupNotice.title}</strong>{policySignupNotice.paragraphs.map(text => <p key={text}>{text}</p>)}<p>회원 식별값·인증 상태·세션 정보(IP·브라우저 정보 포함)도 생성됩니다. Supabase와 인도 DB, 위탁·국외 이전 및 별도 기록의 보관·파기 내용은 전체 처리방침에서 구분해 안내합니다.</p><Link to="/policies/privacy#basis">처리 근거 자세히 보기 <ArrowUpRight size={14}/></Link><span aria-hidden="true"> · </span><Link to="/policies/privacy#overseas">위탁·국외 이전 확인 <ArrowUpRight size={14}/></Link></div>
      <label className="policy-demo-check"><input type="checkbox" disabled /> <span>이용약관 동의 위치 예시 <Link to="/policies/terms">약관 보기</Link></span></label>
      <p className="policy-caption">위 확인란은 이용약관 위치 예시입니다. 해당 필수 계정정보의 수집·이용은 별도 동의가 아닌 고지 방식으로 정리하며, 개인정보처리방침 포괄 동의나 14세 이상 확인란을 두지 않습니다. 새로운 목적의 처리는 필요한 근거와 절차를 따로 검토합니다.</p>
      <button type="button" className="policy-demo-submit" disabled>검토용 · 회원가입을 받지 않습니다</button>
    </div>
  </section>;
}
function ReviewContent() {
  return <>
    <section id="revision" className="policy-section"><div className="policy-section-heading"><span className="policy-kicker">WHAT CHANGED · REVIEW 03</span><h2>계정에 필요한 정보만, 나이 정보는 더 받지 않습니다</h2></div><div className="policy-findings">{policyRevisionChanges.map(item => <div key={item.title}><CheckCircle2 size={19}/><p><strong>{item.title}</strong><br/>{item.detail}</p></div>)}</div><p className="policy-caption">현재 계정 서비스에 객관적으로 필요한 정보만 처리한다는 전제입니다. 나이를 모른다는 이유로 법 적용 전체를 배제하거나, 계정정보의 처리 근거로 위탁·국외 이전 요건까지 면제하는 안은 아닙니다.</p><Link className="btn btn-ghost" to="/policies/review#signup">변경된 가입 안내 먼저 보기 <ArrowUpRight size={16}/></Link></section>
    <section className="policy-review-cards" aria-label="문서별 검토">
      {Object.entries(policyDocuments).map(([key, doc]) => <Link className="policy-review-card" key={key} to={`/policies/${key}`}><FileText size={22}/><h2>{doc.title}</h2><p>{key === 'privacy' ? '계정정보의 항목·목적·처리 근거를 명시합니다. 자동 생성 기록과 위탁·국외 이전은 별도로 안내합니다.' : key === 'terms' ? '회원 계정 이용 조건과 탈퇴 절차. 추가 연령 확인을 가입 조건으로 두지 않는 안입니다.' : '비공식 관계, 출처·저작권, 이메일 문의와 수정 요청 처리의 기준입니다.'}</p><span>초안 살펴보기 <ArrowUpRight size={16}/></span></Link>)}
    </section>
    <section id="findings" className="policy-section"><div className="policy-section-heading"><span className="policy-kicker">PREVIOUSLY VERIFIED</span><h2>기존 점검에서 확인한 내용</h2></div>
      <div className="policy-findings">
        <div><CheckCircle2 size={19}/><p><strong>세 가지 입력도 개인정보입니다.</strong><br/>아이디·이메일이 계정과 연결됩니다. 이번에는 계정 생성·인증·복구에 필요한 처리 근거를 구체적으로 안내합니다.</p></div>
        <div><CheckCircle2 size={19}/><p><strong>화면 입력 외 정보도 생성됩니다.</strong><br/>회원 UUID·가입 시각·인증정보가 있고 세션 IP·User-Agent 저장 여부를 기존 최소 집계에서 확인했습니다. 계정 입력과 구분해 안내합니다.</p></div>
        <div><CheckCircle2 size={19}/><p><strong>DB 저장 위치는 인도입니다.</strong><br/>기존 점검의 운영 Supabase 리전은 ap-south-1입니다. 모든 처리 국가를 뜻하지는 않으며 국외 이전의 미확인 세부사항은 남겨두었습니다.</p></div>
        <div><CheckCircle2 size={19}/><p><strong>문의 창구와 탈퇴 구현은 유지합니다.</strong><br/>옆군 / sengyb@naver.com. 현재 비밀번호 재확인 탈퇴 코드를 유지하며 이 검토 공간에서는 예시 계정만 사용합니다.</p></div>
      </div>
      <p className="policy-caption">기존 확인 범위: develop f1602e78의 관련 소스와 운영 설정·스키마·최소 집계. 이번에는 2차 검토본의 확인 결과를 승계해 문안과 화면을 수정했습니다. 회원별 개인정보 원문을 추가 조회하거나 DB를 변경하지 않았습니다.</p>
    </section>
    <section id="before-publish" className="policy-section"><div className="policy-section-heading"><span className="policy-kicker">STATUS & REMAINING WORK</span><h2>반영한 내용과 정식 시행 전 확인 사항</h2></div><ol className="policy-blockers">{policyBlockers.map(item => <li key={item.title}><strong>{item.title}</strong><p>{item.detail}</p><span className="policy-status-chip">{item.status}</span></li>)}</ol></section>
    <section id="withdrawal" className="policy-section"><span className="policy-kicker">ACCOUNT WITHDRAWAL</span><h2>현재 비밀번호를 다시 확인하는 탈퇴 화면</h2><p>내 정보 → 회원 탈퇴 → 비밀번호 재입력 → 삭제 확인 흐름입니다. 예시 계정으로 정상 완료, 비밀번호 오류, 응답 유실, 관리자 인계 안내를 확인할 수 있습니다.</p><Link className="btn btn-ghost" to="/account/withdraw-review">회원 탈퇴 흐름 검토하기 <ArrowUpRight size={16}/></Link><p className="policy-caption">실제 회원의 비밀번호를 입력하지 마세요. 이 미리보기는 실제 탈퇴 API를 호출하지 않습니다.</p></section>
    <SignupPreview/>
    <section id="preview-safety" className="policy-section"><div className="policy-section-heading"><span className="policy-kicker">REVIEW SCOPE</span><h2>이번 검토안의 범위</h2></div><p>기존 공통 푸터의 세 문서 연결과 비밀번호 재확인 탈퇴 구현은 유지합니다. 모든 정책은 로그인 없이 열리며 모바일과 데스크톱에서 같은 내용을 제공합니다. 가입 시안은 실제 계정을 만들지 않습니다.</p><p>이 주소는 noindex를 적용한 공개 검토 공간이며 운영 사이트 활성화와 분리되어 있습니다. 실제 회원·비밀번호·권한·DB 스키마나 외부 서비스 설정을 변경하지 않습니다. noindex는 접근통제가 아니므로 비밀정보를 게시하지 않습니다.</p><p>이번 수정으로 연령 확인·보호자 인증을 일률적인 필수 개발사항에서 제외했습니다. 운영 탈퇴 기능의 배포·실연동 검증과 로그·메일·백업·위탁·국외 이전의 미확정 사항까지 완료된 것은 아닙니다.</p></section>
    <Sources/>
  </>;
}
export default function PolicyPage() {
  const { document } = useParams();
  const isReview = document === 'review';
  const doc = Object.hasOwn(policyDocuments, document) ? policyDocuments[document] : null;
  if (!isReview && !doc) return <Navigate to="/policies/review" replace/>;
  const title = isReview ? '이용자 안내 3차 검토실' : doc.title;
  return <div className="policy-page">
    <header className="policy-hero">
      <div className="policy-hero-inner"><span className="policy-kicker">{isReview ? 'TRUST & TRANSPARENCY · REVIEW 03' : doc.eyebrow}</span><h1>{title}</h1><p className="policy-lead">{isReview ? '계정정보는 필요한 목적에만. 가입 안내는 더 명확하게.' : doc.lead}</p><div className="policy-meta"><span><ShieldCheck size={15}/> {POLICY_VERSION}</span><span>검토 기준 {POLICY_REVIEW_DATE}</span><span>시행일 미정</span></div></div>
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
