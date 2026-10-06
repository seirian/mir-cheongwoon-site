/** Non-blocking feedback only; dialogs and error messages must not use this timer. */
export const NOTICE_VISIBLE_MS = 10000;
export const NOTICE_FADE_MS = 300;
export function scheduleNotice(onFade, onDismiss, clock = globalThis) {
  let active = true;
  const fade = clock.setTimeout(() => { if (active) onFade(); }, NOTICE_VISIBLE_MS);
  const dismiss = clock.setTimeout(() => { if (active) onDismiss(); }, NOTICE_VISIBLE_MS + NOTICE_FADE_MS);
  return () => {
    active = false;
    clock.clearTimeout(fade);
    clock.clearTimeout(dismiss);
  };
}
