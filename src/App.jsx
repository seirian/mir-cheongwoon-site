import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import PerformanceDetailPage from './pages/PerformanceDetailPage';
import ReviewPage, { PreviewAccountNotice } from './pages/ReviewPage';
import { IS_REVIEW_PREVIEW, IS_SONGBOOK_PREVIEW, IS_POLICY_PREVIEW } from './lib/preview';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import MirPage from './pages/MirPage';
import BandPage from './pages/BandPage';
import HistoryPage from './pages/HistoryPage';
import SchedulePage from './pages/SchedulePage';
import GalleryPage from './pages/GalleryPage';
import GalleryDetailPage from './pages/GalleryDetailPage';
import AdminPage from './pages/AdminPage';
import AccountPage from './pages/AccountPage';
import PolicyPage from './pages/PolicyPage';
import WithdrawalReviewPage from './pages/WithdrawalReviewPage';

const SongbookPage = lazy(() => import('./pages/SongbookPage'));
const SongbookReviewPage = lazy(() => import('./pages/SongbookReviewPage'));
const songbookFallback = <p className="section-wrap loading" role="status">노래책을 불러오는 중…</p>;

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/mir" element={<MirPage />} />
        <Route path="/band" element={<BandPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/history/:slug" element={<PerformanceDetailPage />} />
        <Route path="/review" element={IS_REVIEW_PREVIEW ? <ReviewPage /> : <Navigate to="/" replace />} />
        <Route path="/songbook" element={<Suspense fallback={songbookFallback}><SongbookPage /></Suspense>} />
        <Route path="/songbook/review" element={IS_SONGBOOK_PREVIEW ? <Suspense fallback={songbookFallback}><SongbookReviewPage /></Suspense> : <Navigate to="/songbook" replace />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/gallery/view" element={<GalleryDetailPage />} />
        <Route path="/gallery/:id" element={<GalleryDetailPage />} />
        <Route path="/policies/:document" element={IS_POLICY_PREVIEW ? <PolicyPage /> : <Navigate to="/" replace />} />
        <Route path="/account/withdraw-review" element={IS_POLICY_PREVIEW ? <WithdrawalReviewPage /> : <Navigate to="/account" replace />} />
        <Route path="/account" element={IS_POLICY_PREVIEW ? <Navigate to="/policies/review#signup" replace /> : IS_REVIEW_PREVIEW ? <PreviewAccountNotice /> : <AccountPage />} />
        <Route path="/admin" element={IS_REVIEW_PREVIEW ? <PreviewAccountNotice /> : <AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
