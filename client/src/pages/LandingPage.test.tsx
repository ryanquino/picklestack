import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LandingPage from './LandingPage';

/**
 * Unit tests for the LandingPage component.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10
 */

function renderLandingPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );
}

describe('LandingPage', () => {
  describe('Section rendering', () => {
    it('renders the landing page container', () => {
      renderLandingPage();
      expect(screen.getByTestId('landing-page')).toBeInTheDocument();
    });

    it('renders the hero section', () => {
      renderLandingPage();
      expect(screen.getByTestId('landing-page-hero')).toBeInTheDocument();
    });

    it('renders the how-it-works section', () => {
      renderLandingPage();
      expect(screen.getByTestId('landing-page-how-it-works')).toBeInTheDocument();
    });

    it('renders the features section', () => {
      renderLandingPage();
      expect(screen.getByTestId('landing-page-features')).toBeInTheDocument();
    });

    it('renders the statistics section', () => {
      renderLandingPage();
      expect(screen.getByTestId('landing-page-statistics')).toBeInTheDocument();
    });

    it('renders the screenshots section', () => {
      renderLandingPage();
      expect(screen.getByTestId('landing-page-screenshots')).toBeInTheDocument();
    });

    it('renders the tagline section', () => {
      renderLandingPage();
      expect(screen.getByTestId('landing-page-tagline')).toBeInTheDocument();
    });
  });

  describe('CTA buttons navigate to /create', () => {
    it('every section contains a CTA link targeting /create', () => {
      renderLandingPage();

      const sections = [
        'landing-page-hero',
        'landing-page-how-it-works',
        'landing-page-features',
        'landing-page-statistics',
        'landing-page-screenshots',
        'landing-page-tagline',
      ];

      for (const testId of sections) {
        const section = screen.getByTestId(testId);
        const links = section.querySelectorAll('a[href="/create"]');
        expect(links.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('hero CTA links to /create', () => {
      renderLandingPage();
      const hero = screen.getByTestId('landing-page-hero');
      const link = hero.querySelector('a[href="/create"]');
      expect(link).toBeInTheDocument();
      expect(link).toHaveTextContent('Start a Session');
    });

    it('tagline CTA links to /create', () => {
      renderLandingPage();
      const tagline = screen.getByTestId('landing-page-tagline');
      const link = tagline.querySelector('a[href="/create"]');
      expect(link).toBeInTheDocument();
      expect(link).toHaveTextContent('Create a Session Now');
    });
  });

  describe('Responsive layout classes', () => {
    it('landing page container has the landing-page class', () => {
      renderLandingPage();
      const page = screen.getByTestId('landing-page');
      expect(page).toHaveClass('landing-page');
    });

    it('hero section has BEM class for responsive styling', () => {
      renderLandingPage();
      const hero = screen.getByTestId('landing-page-hero');
      expect(hero).toHaveClass('landing-page__hero');
    });

    it('how-it-works section has BEM class for responsive styling', () => {
      renderLandingPage();
      const section = screen.getByTestId('landing-page-how-it-works');
      expect(section).toHaveClass('landing-page__how-it-works');
    });

    it('features section has BEM class with grid layout', () => {
      renderLandingPage();
      const section = screen.getByTestId('landing-page-features');
      expect(section).toHaveClass('landing-page__features');
      const grid = section.querySelector('.landing-page__features-grid');
      expect(grid).toBeInTheDocument();
    });

    it('statistics section has BEM class with grid layout', () => {
      renderLandingPage();
      const section = screen.getByTestId('landing-page-statistics');
      expect(section).toHaveClass('landing-page__statistics');
      const grid = section.querySelector('.landing-page__stats-grid');
      expect(grid).toBeInTheDocument();
    });

    it('screenshots section has BEM class with grid layout', () => {
      renderLandingPage();
      const section = screen.getByTestId('landing-page-screenshots');
      expect(section).toHaveClass('landing-page__screenshots');
      const grid = section.querySelector('.landing-page__screenshots-grid');
      expect(grid).toBeInTheDocument();
    });

    it('tagline section has BEM class for responsive styling', () => {
      renderLandingPage();
      const section = screen.getByTestId('landing-page-tagline');
      expect(section).toHaveClass('landing-page__tagline');
    });

    it('CTA buttons have BEM modifier classes for styling', () => {
      renderLandingPage();
      const hero = screen.getByTestId('landing-page-hero');
      const primaryCta = hero.querySelector('.landing-page__cta--primary');
      expect(primaryCta).toBeInTheDocument();

      const howItWorks = screen.getByTestId('landing-page-how-it-works');
      const secondaryCta = howItWorks.querySelector('.landing-page__cta--secondary');
      expect(secondaryCta).toBeInTheDocument();
    });
  });

  describe('Content verification', () => {
    it('hero section contains a headline and subtitle', () => {
      renderLandingPage();
      const hero = screen.getByTestId('landing-page-hero');
      const headline = hero.querySelector('.landing-page__headline');
      const subtitle = hero.querySelector('.landing-page__subtitle');
      expect(headline).toBeInTheDocument();
      expect(subtitle).toBeInTheDocument();
    });

    it('how-it-works section contains four steps', () => {
      renderLandingPage();
      const section = screen.getByTestId('landing-page-how-it-works');
      const steps = section.querySelectorAll('.landing-page__step');
      expect(steps).toHaveLength(4);
    });

    it('features section contains four feature cards', () => {
      renderLandingPage();
      const section = screen.getByTestId('landing-page-features');
      const cards = section.querySelectorAll('.landing-page__feature-card');
      expect(cards).toHaveLength(4);
    });

    it('statistics section contains three stat items', () => {
      renderLandingPage();
      const section = screen.getByTestId('landing-page-statistics');
      const stats = section.querySelectorAll('.landing-page__stat');
      expect(stats).toHaveLength(3);
    });

    it('screenshots section contains three screenshot placeholders', () => {
      renderLandingPage();
      const section = screen.getByTestId('landing-page-screenshots');
      const screenshots = section.querySelectorAll('.landing-page__screenshot-placeholder');
      expect(screenshots).toHaveLength(3);
    });
  });
});
