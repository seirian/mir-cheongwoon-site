import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import './feature-overrides.css';
import './schedule-harmony.css';
import './schedule-preview-fixes.css';
import './schedule-hero-fixes.css';
import './site-width.css';
import './fanart-live.css';
import './schedule-quick-add.css';
import './media-gallery.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={window.location.pathname.startsWith(import.meta.env.BASE_URL) ? import.meta.env.BASE_URL.replace(/\/$/, '') : '/'}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
