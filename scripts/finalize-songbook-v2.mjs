import {readFile,writeFile} from 'node:fs/promises';
// Preserve repeated-category selection even when navigation renders asynchronously.
const file='src/pages/SongbookV2Page.jsx';
let text=await readFile(file,'utf8');
text=text.replace("onChange={()=>update({category:selectedCategories.includes(c)?selectedCategories.filter(x=>x!==c):[...selectedCategories,c]})}","onChange={event=>{const current=new URLSearchParams(window.location.search).getAll('category');update({category:event.target.checked?[...new Set([...current,c])]:current.filter(x=>x!==c)});}}");
await writeFile(file,text);
