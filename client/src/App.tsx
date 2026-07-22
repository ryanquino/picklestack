import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import LayoutShell from './components/LayoutShell';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const CreateSession = lazy(() => import('./pages/CreateSession'));
const OrganizerDashboard = lazy(() => import('./pages/OrganizerDashboard'));
const LiveView = lazy(() => import('./pages/LiveView'));
const JoinSession = lazy(() => import('./pages/JoinSession'));
const PlayerView = lazy(() => import('./pages/PlayerView'));
const NotFound = lazy(() => import('./pages/NotFound'));
const BlogList = lazy(() => import('./pages/BlogList'));
const BlogPostPage = lazy(() => import('./pages/BlogPost'));
const BlogEditor = lazy(() => import('./pages/BlogEditor'));

function App() {
  return (
    <LayoutShell>
      <Suspense fallback={<div className="app-loading">Loading...</div>}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/create" element={<CreateSession />} />
          <Route path="/session/:sessionId" element={<OrganizerDashboard />} />
          <Route path="/live/:sessionId" element={<LiveView />} />
          <Route path="/join/:sessionId" element={<JoinSession />} />
          <Route path="/player/:sessionId/:playerId" element={<PlayerView />} />
          <Route path="/blog" element={<BlogList />} />
          <Route path="/blog/new" element={<BlogEditor />} />
          <Route path="/blog/edit/:id" element={<BlogEditor />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </LayoutShell>
  );
}

export default App;
