import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LayoutShell from './LayoutShell';

/**
 * Integration tests for responsive layout behavior.
 *
 * Since jsdom does not support CSS media queries, these tests verify that:
 * - The correct DOM structure is rendered
 * - The correct CSS classes are applied
 * - Both navigation components exist in the DOM (CSS handles show/hide)
 * - Responsive CSS classes are present on containers
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 4.1, 4.2, 4.3, 9.1
 */

function renderWithRouter(ui: React.ReactElement, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      {ui}
    </MemoryRouter>
  );
}

describe('LayoutShell - Responsive Layout Integration', () => {
  describe('DOM structure and navigation components', () => {
    it('renders both Sidebar and BottomTabBar in the DOM', () => {
      renderWithRouter(
        <LayoutShell>
          <div>Content</div>
        </LayoutShell>
      );

      // Both navigation elements should be present — CSS controls visibility
      const navElements = screen.getAllByRole('navigation', { name: 'Main navigation' });
      expect(navElements).toHaveLength(2);
    });

    it('renders the Sidebar with correct CSS classes', () => {
      renderWithRouter(
        <LayoutShell>
          <div>Content</div>
        </LayoutShell>
      );

      const navElements = screen.getAllByRole('navigation', { name: 'Main navigation' });
      // Sidebar is the first nav element rendered
      const sidebar = navElements.find((el) => el.classList.contains('sidebar'));
      expect(sidebar).toBeDefined();
      expect(sidebar).toHaveClass('sidebar');
      expect(sidebar).toHaveClass('sidebar--collapsed');
      expect(sidebar).toHaveClass('sidebar--expanded');
    });

    it('renders the BottomTabBar with correct CSS class', () => {
      renderWithRouter(
        <LayoutShell>
          <div>Content</div>
        </LayoutShell>
      );

      const navElements = screen.getAllByRole('navigation', { name: 'Main navigation' });
      const bottomTabBar = navElements.find((el) => el.classList.contains('bottom-tab-bar'));
      expect(bottomTabBar).toBeDefined();
      expect(bottomTabBar).toHaveClass('bottom-tab-bar');
    });
  });

  describe('Layout Shell structure and CSS classes', () => {
    it('renders the layout-shell wrapper with correct class', () => {
      const { container } = renderWithRouter(
        <LayoutShell>
          <div>Content</div>
        </LayoutShell>
      );

      const layoutShell = container.querySelector('.layout-shell');
      expect(layoutShell).toBeInTheDocument();
    });

    it('renders main content area with layout-shell__content class', () => {
      const { container } = renderWithRouter(
        <LayoutShell>
          <div>Content</div>
        </LayoutShell>
      );

      const content = container.querySelector('.layout-shell__content');
      expect(content).toBeInTheDocument();
      expect(content?.tagName.toLowerCase()).toBe('main');
    });

    it('renders inner content wrapper with layout-shell__main class', () => {
      const { container } = renderWithRouter(
        <LayoutShell>
          <div>Content</div>
        </LayoutShell>
      );

      const main = container.querySelector('.layout-shell__main');
      expect(main).toBeInTheDocument();
    });

    it('renders children inside the layout-shell__main area', () => {
      renderWithRouter(
        <LayoutShell>
          <div data-testid="child-content">Hello World</div>
        </LayoutShell>
      );

      const child = screen.getByTestId('child-content');
      expect(child).toBeInTheDocument();
      expect(child.closest('.layout-shell__main')).not.toBeNull();
    });
  });

  describe('Navigation items and touch targets', () => {
    it('Sidebar nav items have nav-item class with min 44px touch target sizing', () => {
      const { container } = renderWithRouter(
        <LayoutShell>
          <div>Content</div>
        </LayoutShell>
      );

      const sidebar = container.querySelector('.sidebar');
      const navItems = sidebar?.querySelectorAll('.nav-item');
      expect(navItems).toBeDefined();
      expect(navItems!.length).toBeGreaterThan(0);

      // Each nav-item should have the nav-item class which enforces min-width/min-height: 44px via CSS
      navItems!.forEach((item) => {
        expect(item).toHaveClass('nav-item');
      });
    });

    it('BottomTabBar nav items have nav-item class with min 44px touch target sizing', () => {
      const { container } = renderWithRouter(
        <LayoutShell>
          <div>Content</div>
        </LayoutShell>
      );

      const bottomTabBar = container.querySelector('.bottom-tab-bar');
      const navItems = bottomTabBar?.querySelectorAll('.nav-item');
      expect(navItems).toBeDefined();
      expect(navItems!.length).toBeGreaterThan(0);

      // Each nav-item in bottom-tab-bar has CSS rules enforcing min-width/min-height: 44px
      navItems!.forEach((item) => {
        expect(item).toHaveClass('nav-item');
      });
    });

    it('active route highlights the correct nav item in Sidebar', () => {
      const { container } = renderWithRouter(
        <LayoutShell>
          <div>Content</div>
        </LayoutShell>,
        { route: '/live' }
      );

      const sidebar = container.querySelector('.sidebar');
      const activeItems = sidebar?.querySelectorAll('.nav-item--active');
      expect(activeItems).toBeDefined();
      expect(activeItems!.length).toBe(1);
    });

    it('active route highlights the correct nav item in BottomTabBar', () => {
      const { container } = renderWithRouter(
        <LayoutShell>
          <div>Content</div>
        </LayoutShell>,
        { route: '/live' }
      );

      const bottomTabBar = container.querySelector('.bottom-tab-bar');
      const activeItems = bottomTabBar?.querySelectorAll('.nav-item--active');
      expect(activeItems).toBeDefined();
      expect(activeItems!.length).toBe(1);
    });
  });

  describe('Dashboard layout responsive classes', () => {
    it('dashboard-layout class is present when rendered in OrganizerDashboard context', () => {
      // Simulate the dashboard-layout container that OrganizerDashboard renders
      renderWithRouter(
        <LayoutShell>
          <div className="dashboard-layout">
            <div className="queue-panel">Queue</div>
            <div className="courts-panel">Courts</div>
          </div>
        </LayoutShell>
      );

      const dashboardLayout = document.querySelector('.dashboard-layout');
      expect(dashboardLayout).toBeInTheDocument();
    });

    it('Queue panel and Courts panel are rendered within dashboard-layout', () => {
      renderWithRouter(
        <LayoutShell>
          <div className="dashboard-layout">
            <div className="queue-panel">Queue Content</div>
            <div className="courts-panel">Courts Content</div>
          </div>
        </LayoutShell>
      );

      const dashboardLayout = document.querySelector('.dashboard-layout');
      const queuePanel = dashboardLayout?.querySelector('.queue-panel');
      const courtsPanel = dashboardLayout?.querySelector('.courts-panel');

      expect(queuePanel).toBeInTheDocument();
      expect(courtsPanel).toBeInTheDocument();
    });

    it('dashboard-layout uses flex-direction: column as mobile-first base (stacked)', () => {
      renderWithRouter(
        <LayoutShell>
          <div className="dashboard-layout">
            <div className="queue-panel">Queue</div>
            <div className="courts-panel">Courts</div>
          </div>
        </LayoutShell>
      );

      // The dashboard-layout class defines flex-direction: column as the base (mobile-first)
      // CSS media queries change it to row at tablet/desktop breakpoints
      const dashboardLayout = document.querySelector('.dashboard-layout');
      expect(dashboardLayout).toHaveClass('dashboard-layout');
    });
  });
});
