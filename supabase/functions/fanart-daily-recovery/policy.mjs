/** No network or database access: also exercised by Node's offline test runner. */
export function kstClock(now = Date.now()) {
  const shifted = new Date(now + 9 * 3600000);
  return { date: shifted.toISOString().slice(0, 10), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}
export function evaluateFanart(data, mode, now = Date.now()) {
  const clock = kstClock(now);
  const retry = data?.retry;
  if (retry?.version !== 2 || retry.batchDate !== clock.date
      || !['not_due', 'ready', 'waiting', 'running', 'success', 'exhausted', 'closed'].includes(retry.state)
      || !Number.isInteger(retry.attemptsToday) || retry.attemptsToday < 0 || retry.attemptsToday > 4
      || retry.maxAttempts !== 4 || !Number.isFinite(Date.parse(retry.checkedAt))
      || now - Date.parse(retry.checkedAt) > 120000 || Date.parse(retry.checkedAt) - now > 60000) {
    throw new Error('fanart_retry_policy_unavailable');
  }
  const success = retry.state === 'success';
  if (success && (data.lastRun?.status !== 'success' || data.lastRun.batchDate !== clock.date
      || data.snapshot?.batchDate !== clock.date || data.snapshot.articleId !== data.lastRun.articleId
      || !(data.snapshot.imageCount > 0))) throw new Error('fanart_snapshot_inconsistent');
  const exhausted = retry.state === 'exhausted';
  const cutoff = clock.minutes >= 23 * 60 + 55;
  return {
    date: clock.date, outcome: success ? 'success' : exhausted || cutoff ? 'failure' : 'waiting',
    terminal: success || exhausted || cutoff,
    reason: success ? null : exhausted ? 'daily_attempts_exhausted' : cutoff ? 'daily_retry_window_closed' : retry.reason,
    mayRun: mode === 'tick' && clock.minutes >= 60 && clock.minutes < 23 * 60 + 50 && retry.state === 'ready',
    retry, lastRun: data.lastRun ?? null, snapshot: data.snapshot ?? null,
    lastAttempt: Array.isArray(data.history) ? data.history.find(row => row.batchDate === clock.date
      && ['success', 'failed'].includes(row.status) && row.error !== 'upstream_backoff_active') ?? null : null,
  };
}
export function unavailableFanart(error, now = Date.now()) {
  const clock = kstClock(now);
  const terminal = clock.minutes >= 23 * 60 + 55;
  return { date: clock.date, outcome: terminal ? 'failure' : 'waiting', terminal, reason: error,
    mayRun: false, retry: null, lastRun: null, snapshot: null };
}
export function formatKst(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time + 9 * 3600000).toISOString().slice(0, 19).replace('T', ' ') + ' KST' : '확인 불가';
}
export function fanartMessage(decision, phase) {
  const { outcome, retry, lastRun, snapshot } = decision;
  const failure = lastRun?.status === 'failed' ? lastRun : decision.lastAttempt;
  const icon = outcome === 'success' ? '✅' : outcome === 'waiting' ? '⏳' : '🚨';
  const label = phase === 'final' ? '최종 결과' : '01시 점검';
  const lines = [`${icon} **mir.yeop.net 팬아트 백업 ${label}**`, `- 기준일: ${decision.date} KST`];
  if (outcome === 'success') {
    lines.push(`- ${phase === 'final' ? '최종 백업 성공' : '백업 성공'}: 게시글 #${lastRun.articleId} / 이미지 ${snapshot.imageCount}장`);
    lines.push(`- 저장 시각: ${formatKst(snapshot.batchCollectedAt)}`);
  } else {
    lines.push(`- ${outcome === 'waiting' ? '대기 중 · 아직 최종 실패 아님' : '당일 백업 미완료'}`);
    if (decision.reason) lines.push(`- 사유: ${String(decision.reason).replace(/[^a-z0-9_]/g, '').slice(0, 80)}`);
    if (failure?.status === 'failed' && failure.error !== 'upstream_backoff_active') {
      lines.push(`- 최근 실제 수집 오류: ${String(failure.error || 'unknown').replace(/[^a-z0-9_]/g, '').slice(0, 80)}`);
    }
    if (retry?.nextAttemptAt && outcome === 'waiting') lines.push(`- 재시도 가능: ${formatKst(retry.nextAttemptAt)} 이후 정기 점검`);
    if (outcome === 'waiting') lines.push('- 제한 대기 중 원본 재호출 없음 · 매시 20/50분 조건 확인');
    lines.push(snapshot ? `- 기존 정상 저장본 유지: ${formatKst(snapshot.batchCollectedAt)}` : '- 기존 저장본 상태: 확인 불가');
  }
  if (retry) lines.push(`- 실제 수집: ${retry.attemptsToday}/${retry.maxAttempts}회 (대기 점검 제외)`);
  return lines.join('\n').slice(0, 1900);
}
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

// A missed initial invocation is caught by the next tick. Only identical terminal results are suppressed.
export function notificationPlan(decision, mode, initial) {
  if (mode === 'initial') return 'initial';
  if (!decision.terminal) return 'initial';
  if (initial?.delivery === 'sent' && initial.outcome === decision.outcome) return null;
  return 'final';
}
