import {useCallback, useEffect, useState} from 'react';
import {scheduleNotice} from './noticeTimer.js';
import '../songbook-notice.css';

/** Each notification is a new event, even when its text is identical. */
export function useTimedNotice() {
  const [notice, setNotice] = useState({text:'', id:0, autoDismiss:false, phase:'visible'});
  const show = useCallback((text = '', {autoDismiss = true} = {}) => {
    setNotice(previous => ({text, id:previous.id + 1, autoDismiss, phase:'visible'}));
  }, []);
  const {text, id, autoDismiss, phase} = notice;
  useEffect(() => {
    if (!text || !autoDismiss) return undefined;
    // Functional updates also reject callbacks from an older notification.
    return scheduleNotice(
      () => setNotice(current => current.id === id ? {...current, phase:'closing'} : current),
      () => setNotice(current => current.id === id ? {...current, text:''} : current),
    );
  }, [id, text, autoDismiss]);
  return [text, show, {'data-notice-state':autoDismiss ? phase : 'persistent'}];
}
