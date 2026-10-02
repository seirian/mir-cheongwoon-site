import {readFile,writeFile} from 'node:fs/promises';
/** One-time, idempotent integration into the existing revision-two page. CI commits the resulting source. */
let file='src/lib/songbookV2.js',text=await readFile(file,'utf8');
if(!text.includes("from './songbookMedia.js'")){
 text="import {vodInfo, artworkFields, artworkUrl, musicUrl} from './songbookMedia.js';\n"+text;
 const a=text.indexOf('export function videoUrl('),b=text.indexOf('export function publicSong(');
 if(a<0||b<a)throw Error('Cannot locate video model');
 text=text.slice(0,a)+"export function videoUrl(value){return vodInfo(value)?.url || '';}\n"+text.slice(b);
 text=text.replace('publicSong(s){return {id:', 'publicSong(s){return {...artworkFields(s),id:');
 const target="return {id:input.id,title,artist,categories,aliases,video_urls:";
 if(!text.includes(target))throw Error('Cannot locate editor payload');
 text=text.replace(target,"const art=artworkFields(input);if(input.artworkUrl&&(!artworkUrl(input.artworkUrl)||!musicUrl(input.musicUrl)))throw new Error('앨범 이미지와 음원 연결 주소를 확인해주세요.');return {artwork_url:art.artworkUrl,music_url:art.musicUrl,album_title:art.album,id:input.id,title,artist,categories,aliases,video_urls:");
 const start=text.indexOf('export function duplicateOf('),end=text.indexOf('export function csv(');
 if(start<0||end<start)throw Error('Cannot locate duplicate function');
 text=text.slice(0,start)+"export function duplicateOf(songs,input){const link=artworkFields(input).musicUrl;const id=link?new URL(link).searchParams.get('i'):null;return songs.find(s=>s.id!==input.id&&((normalize(s.title)===normalize(input.title)&&normalize(s.artist)===normalize(input.artist))||(id&&s.musicUrl&&new URL(s.musicUrl).searchParams.get('i')===id)));}\n"+text.slice(end);
 await writeFile(file,text);
}
file='src/pages/SongbookV2Page.jsx';text=await readFile(file,'utf8');
if(!text.includes('sb3-song-main')){
 const a=text.indexOf('function Editor('),b=text.indexOf('function AccessPanel(');
 if(a<0||b<a)throw Error('Cannot locate old editor');
 text=text.slice(0,a)+text.slice(b);
 text="import Editor from '../components/songbook/SongEditor';\nimport {SongCover, VodLinks, VideoMark} from '../components/songbook/SongMedia';\n"+text;
 text=text.replace("import '../songbook-v2.css';", "import '../songbook-v2.css';\nimport '../songbook-v3.css';");
 text=text.replaceAll('2차 검토안','3차 검토안').replaceAll('2차 변경점','3차 변경점').replaceAll('VOL. 02','VOL. 03');
 text=text.replace('<Editor key=', '<Editor Modal={Modal} StarPicker={StarPicker} key=');
 text=text.replace('<div className="sb2-song-main"><div className="sb2-title-line">','<div className="sb2-song-main sb3-song-main"><SongCover song={s}/><div className="sb3-track-copy"><div className="sb2-title-line">');
 text=text.replace(/\{s\.videoUrls\[0\]&&<a[\s\S]*?<\/a>\}/, '<VodLinks urls={s.videoUrls} title={s.title}/>');
 text=text.replace('{s.categories.map(c=><span key={c}>{c}</span>)}</div></div><div className="sb2-rating">','{s.categories.map(c=><span key={c}>{c}</span>)}</div></div></div><div className="sb2-rating">');
 text=text.replace('<p>{selected.artist}</p>','<div className="sb3-detail-intro"><SongCover song={selected}/><div><p>{selected.artist}</p>{selected.album&&<small>{selected.album}</small>}</div></div>');
 text=text.replace(/<div className="sb2-video-list">[\s\S]*?<\/div>/, '<VodLinks urls={selected.videoUrls} title={selected.title} detailed/>');
 text=text.replace('<div className="sb2-song-list"','<p className="sb3-legend"><span><VideoMark platform="youtube"/> YouTube VOD</span><span><VideoMark platform="soop"/> SOOP VOD</span><small>같은 플랫폼의 영상은 번호로 구분합니다.</small></p><div className="sb2-song-list"');
 if(text.includes('s.videoUrls[0]')||text.includes('function Editor('))throw Error('Incomplete revision three integration');
 await writeFile(file,text);
}
for(const path of ['src/components/Layout.jsx','src/data/pageMetadata.js']){
 const before=await readFile(path,'utf8');await writeFile(path,before.replaceAll('노래책 2차','노래책 3차'));
}
file='scripts/songbook-v2-browser-check.py';text=await readFile(file,'utf8');text=text.replace("name='영상 1 새 탭에서 보기 ↗'","name='검토용 새 노래 YouTube VOD 새 탭에서 보기'");await writeFile(file,text);
console.log('Revision three integration ready.');
