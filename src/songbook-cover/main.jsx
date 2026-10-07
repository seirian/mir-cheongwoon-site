import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import SongbookUsabilityPage from '../pages/SongbookUsabilityPage.jsx';
import './shell.css';
const base=import.meta.env.BASE_URL;
if(location.pathname.endsWith('/index.html'))history.replaceState(history.state,'',location.pathname.slice(0,-10)+location.search+location.hash);
function Preview(){return <>
  <header className="sg-preview-header"><span><img src={`${base}icon_img.png`} width={32} height={32} alt=""/>미르 <b>×</b> 청운밴드</span><a href="https://mir.yeop.net/songbook/" target="_blank" rel="noopener noreferrer">운영 노래책</a></header>
  <aside className="sg-preview-banner"><strong>보기 방식 · 2차 검토</strong><span>운영 목록의 읽기 전용 사본입니다. 즐겨찾기와 보기 방식만 이 브라우저에 보관되며 운영 데이터는 변경되지 않습니다.</span></aside>
  <SongbookUsabilityPage favoritesKey="mir-songbook-cover-preview-favorites-v1" layoutKey="mir-songbook-cover-preview-layout-v1"/>
  <footer className="sg-preview-footer">목록형·커버형 2차 검토 · 운영 데이터는 변경되지 않습니다.</footer>
 </>;}
createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter basename={base.replace(/\/$/,'')||'/'}><Preview/></BrowserRouter></React.StrictMode>);
