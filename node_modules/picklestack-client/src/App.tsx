import { Routes, Route } from 'react-router-dom';
import CreateSession from './pages/CreateSession';
import LandingPage from './pages/LandingPage';
import OrganizerDashboard from './pages/OrganizerDashboard';
import LiveView from './pages/LiveView';
import NotFound from './pages/NotFound';
import LayoutShell from './components/LayoutShell';

function App() {
  return (
    <LayoutShell>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/create" element={<CreateSession />} />
        <Route path="/session/:sessionId" element={<OrganizerDashboard />} />
        <Route path="/live/:sessionId" element={<LiveView />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </LayoutShell>
  );
}

export default App;
