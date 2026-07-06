import { useLocation } from 'react-router-dom';

interface LayoutShellProps {
  children: React.ReactNode;
}

/**
 * LayoutShell wraps all routed pages, providing:
 * - Sidebar navigation (visible on tablet/desktop via CSS)
 * - BottomTabBar navigation (visible on mobile via CSS)
 * - Main content area with proper margins for the fixed sidebar
 *
 * Note: SessionHeader is rendered by OrganizerDashboard directly,
 * since it needs access to session state and action handlers.
 */
function LayoutShell({ children }: LayoutShellProps) {
  return (
    <div className="layout-shell">
      <main className="layout-shell__content layout-shell__content--no-sidebar">
        <div className="layout-shell__main">
          {children}
        </div>
      </main>
    </div>
  );
}

export default LayoutShell;
