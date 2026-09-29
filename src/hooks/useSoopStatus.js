import { useEffect, useState } from 'react';
export default function useSoopStatus() {
  const [status, setStatus] = useState('checking');
  useEffect(() => {
    let active = true;
    let pending;
    async function check() {
      if (document.hidden) return;
      pending?.abort(); pending = new AbortController();
      const request = pending;
      const timeout = setTimeout(() => request.abort(), 8000);
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}api/soop-live.php`, { headers: { Accept: 'application/json' }, signal: request.signal });
        const data = response.ok ? await response.json() : null;
        if (active) setStatus(['live', 'offline'].includes(data?.status) ? data.status : 'unknown');
      } catch { if (active) setStatus('unknown'); }
      finally { clearTimeout(timeout); }
    }
    check();
    const timer = setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    return () => { active = false; pending?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', check); };
  }, []);
  return status;
}
