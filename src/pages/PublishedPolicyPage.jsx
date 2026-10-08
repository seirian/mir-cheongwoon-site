import { Link, Navigate, useParams } from 'react-router-dom';
import { publishedPolicies, POLICY_EFFECTIVE_DATE, PUBLISHED_POLICY_VERSION } from '../data/policyPublished';
import '../policies.css';
export default function PublishedPolicyPage() {
  const { document } = useParams();
  const doc = Object.hasOwn(publishedPolicies, document) ? publishedPolicies[document] : null;
  if (!doc) return <Navigate to="/policies/privacy" replace/>;
  return <div className="policy-page"><header className="policy-hero"><div className="policy-hero-inner"><span className="policy-kicker">{doc.eyebrow}</span><h1>{doc.title}</h1><p className="policy-lead">{doc.lead}</p><div className="policy-meta"><span>버전 {PUBLISHED_POLICY_VERSION}</span><span>최초 공개 {POLICY_EFFECTIVE_DATE}</span></div></div></header>
    <div className="policy-content"><nav className="policy-tabs" aria-label="안내 문서">{Object.entries(publishedPolicies).map(([key,item]) => <Link key={key} to={`/policies/${key}`} aria-current={key === document ? 'page' : undefined}>{item.title}</Link>)}</nav>
      <nav className="policy-toc" aria-label="문서 목차"><strong>이 페이지에서 확인할 내용</strong><div>{doc.sections.map(s => <a key={s.id} href={`#${s.id}`}>{s.title}</a>)}</div></nav>
      <article className="policy-document">{doc.sections.map(s => <section key={s.id} id={s.id} className="policy-section"><h2>{s.title}</h2>{s.paragraphs?.map((p,i) => <p key={i}>{p}</p>)}{s.table && <div className="policy-table-scroll" role="region" aria-label={s.title} tabIndex={0}><table><thead><tr>{s.table.headers.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{s.table.rows.map((r,i) => <tr key={i}>{r.map((v,j) => j === 0 ? <th key={j} scope="row">{v}</th> : <td key={j}>{v}</td>)}</tr>)}</tbody></table></div>}{s.note && <aside className="policy-pending"><strong>처리 범위와 추가 확인 안내</strong><p>{s.note}</p></aside>}</section>)}</article>
      <div className="policy-end"><span>{POLICY_EFFECTIVE_DATE} · 버전 {PUBLISHED_POLICY_VERSION}</span><a href="mailto:sengyb@naver.com">옆군에게 이메일 문의</a></div>
      {document === 'privacy' && <details className="policy-sources"><summary>관련 법령·서비스 자료</summary><p><a href="https://www.law.go.kr/법령/개인정보보호법" target="_blank" rel="noopener noreferrer">개인정보 보호법</a> · <a href="https://supabase.com/legal/customer-resources/data-processing-addendum" target="_blank" rel="noopener noreferrer">Supabase DPA</a> · <a href="https://supabase.com/docs/guides/auth/managing-user-data" target="_blank" rel="noopener noreferrer">계정 삭제 안내</a> · <a href="https://www.privacy.go.kr/" target="_blank" rel="noopener noreferrer">개인정보 포털</a></p></details>}
    </div></div>;
}
