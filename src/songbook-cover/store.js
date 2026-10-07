/** Build-time replacement for songbookStore ONLY in the isolated cover preview. */
import {useCallback,useEffect,useState} from 'react';
import {parseSnapshot} from '../songbook-check/model.js';
export const songbookClient=null;
const noWrite=async()=>{throw Error('이 페이지는 보기 방식 검토 전용이며 운영 데이터를 저장하지 않습니다.');};
export function useSongbookStore() {
  const [state,setState]=useState({songs:[],ready:false,error:''}),[revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(v=>v+1),[]);
  useEffect(()=>{
    const controller=new AbortController();let active=true;
    setState({songs:[],ready:false,error:''});
    fetch(`${import.meta.env.BASE_URL}songbook-cover-snapshot.json`,{signal:controller.signal,credentials:'omit',redirect:'error'})
      .then(async response=>{if(!response.ok)throw Error('snapshot unavailable');return parseSnapshot(await response.json());})
      .then(snapshot=>{if(active)setState({songs:snapshot.songs,ready:true,error:''});})
      .catch(error=>{if(active&&error.name!=='AbortError')setState({songs:[],ready:false,error:'검토용 목록을 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.'});});
    return()=>{active=false;controller.abort();};
  },[revision]);
  return {...state,session:null,role:null,admin:false,canEdit:false,canRate:false,canDelete:false,saving:false,authChecking:false,autoError:'',client:null,revisionFor:()=>0,refresh,saveSong:noWrite,saveRating:noWrite,saveRequestStatuses:noWrite,deleteSong:noWrite,restoreSong:noWrite};
}
