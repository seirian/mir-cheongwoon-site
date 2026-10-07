import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import Preview from './Preview.jsx';
import './preview.css';
import './round3.css';
const base=import.meta.env.BASE_URL.replace(/\/$/,'');
if(location.pathname.endsWith('/index.html'))history.replaceState(history.state,'',location.pathname.slice(0,-10)+location.search);
createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter basename={base||'/'}><Preview/></BrowserRouter></React.StrictMode>);
