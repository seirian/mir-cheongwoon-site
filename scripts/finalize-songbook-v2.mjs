// Deterministic integration step; the preview workflow commits its changes before testing.
import {readFile,writeFile} from 'node:fs/promises';
const replace=async(path,pairs)=>{let text=await readFile(path,'utf8');for(const [from,to] of pairs)text=text.replaceAll(from,to);await writeFile(path,text);};
await replace('src/components/Layout.jsx',[["노래책 1차 검토용 · 운영에 반영되지 않은 초안","노래책 2차 검토안 · 운영과 분리된 편집 공간"]]);
await replace('src/data/pageMetadata.js',[["곡명·가수·분류로 미르의 노래 목록을 검색하고, 원본 출처와 연결 영상을 확인하세요. 공개 자료 대조 초안입니다.","미르의 노래를 카테고리와 별점으로 찾고, 연결 영상과 숙련도를 확인하세요."],["노래책 1차 검토실 — 미르 × 청운밴드","노래책 2차 검토실 — 미르 × 청운밴드"],["미르 노래책의 출처, 수록 기준, 미리내 검색 후보와 미확인 사항을 검토합니다.","다중 카테고리, 별점 필터, 영상 바로가기와 편집 기능을 검토합니다."]]);
await replace('src/lib/songbookV2.js',[["String(q).trim()","String(q||'').trim()"]]);
await replace('src/lib/songbookStore.js',[["同じ曲が既に登録されているか、更新が競合しました。","같은 곡이 이미 등록되었거나 갱신이 충돌했습니다."],["別の画面で更新されています。再読み込みしてから保存してください。","다른 화면에서 변경되었습니다. 새로고침 후 다시 저장해주세요."],["保存できませんでした。権限・入力内容・接続を確認してください。","저장하지 못했습니다. 권한·입력값·연결을 확인해주세요."],["編集権限がありません。","편집 권한이 없습니다."]]);
await replace('scripts/songbook-v2-browser-check.py',[["to_be_visible();page.keyboard.press('Escape');checks.append('manual song add with multiple categories')","to_be_visible();checks.append('manual song add with multiple categories')"]]);
const pkg=JSON.parse(await readFile('package.json','utf8'));pkg.scripts.pretest='node scripts/prepare-songbook-v2.mjs';pkg.scripts.prebuild='node scripts/prepare-songbook-v2.mjs';pkg.scripts.predev='node scripts/prepare-songbook-v2.mjs';await writeFile('package.json',JSON.stringify(pkg,null,2)+'\n');
