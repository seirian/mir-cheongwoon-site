import {List,LayoutGrid} from 'lucide-react';
export default function SongbookViewSwitch({value,onChange}) {
  return <div className="sg-view-switch" role="group" aria-label="노래책 보기 방식">
    {[["list","목록형",List],["cover","커버형",LayoutGrid]].map(([mode,label,Icon])=><button key={mode} type="button" aria-pressed={value===mode} aria-controls="songbook-results" onClick={()=>onChange(mode)}><Icon size={17} aria-hidden="true"/><span>{label}</span></button>)}
  </div>;
}
