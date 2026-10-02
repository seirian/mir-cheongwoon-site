import {readFile,writeFile} from 'node:fs/promises';
// Idempotent integration correction, committed by snapshot before tests.
const file='src/pages/SongbookV2Page.jsx';
let text=await readFile(file,'utf8');
text=text.replace('<select value={draft.requestStatus}', '<select aria-label="신청 가능 상태" value={draft.requestStatus}');
await writeFile(file,text);
