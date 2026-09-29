// Defense in depth for this review build. Real database authorization remains RLS.
export function createReadOnlyFetch(fetcher) {
  return (input, init = {}) => {
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD'].includes(method)) {
      return Promise.resolve(new Response(JSON.stringify({ message: '검토용 미리보기에서는 데이터를 변경할 수 없습니다.', code: 'PREVIEW_READ_ONLY' }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }
    return fetcher(input, init);
  };
}
