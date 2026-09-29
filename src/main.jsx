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
import './schedule-memo.css';
import './media-gallery.css';
import './site-final-polish.css';
import './member-auth.css';
import './promotion.css';
import './promotion-v2.css';

// Static document URLs and clean routes must resolve to the same React page.
if (window.location.pathname.endsWith('/index.html')) {
  window.history.replaceState(window.history.state, '', window.location.pathname.slice(0, -10) + window.location.search + window.location.hash);
}
const assetBase = import.meta.env.BASE_URL.replace(/\/$/, '');
const basename = assetBase && (window.location.pathname === assetBase || window.location.pathname.startsWith(`${assetBase}/`)) ? assetBase : '/';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
