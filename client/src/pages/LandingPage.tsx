import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getSessionHistory, SessionHistoryEntry } from '../sessionHistory';

function LandingPage() {
  const recentSessions = getSessionHistory().filter(s => s.status === 'active');

  return (
    <div className="landing-page" data-testid="landing-page">
      <Navbar />

      {/* Recent Sessions - shown only if there are active sessions */}
      {recentSessions.length > 0 && (
        <section style={{ padding: '1rem 1.5rem', maxWidth: '600px', margin: '0 auto' }}>
          <h3 style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Resume Session
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {recentSessions.slice(0, 3).map((session: SessionHistoryEntry) => (
              <Link
                key={session.sessionId}
                to={`/session/${session.sessionId}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  background: 'rgba(37, 99, 235, 0.08)',
                  border: '1px solid rgba(96, 165, 250, 0.2)',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'border-color 0.15s',
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{session.name}</span>
                  <span style={{ marginLeft: '0.75rem', fontSize: '0.8rem', color: '#64748b' }}>
                    {session.courtCount} courts
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 500 }}>● Live</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Hero Section */}
      <section className="landing-page__hero" data-testid="landing-page-hero">
        <h1 className="landing-page__headline">Organize Pickleball Open Play Effortlessly</h1>
        <p className="landing-page__subtitle">
          Smart matchmaking, live scoreboards, and seamless court management — all in one place.
        </p>
        <Link to="/create" className="landing-page__cta landing-page__cta--primary">
          Start Open Play
        </Link>
      </section>

      {/* How It Works Section */}
      <section className="landing-page__how-it-works" data-testid="landing-page-how-it-works">
        <h2 className="landing-page__section-title">How It Works</h2>
        <div className="landing-page__steps">
          <div className="landing-page__step">
            <span className="landing-page__step-number">1</span>
            <h3 className="landing-page__step-title">Create an Open Play</h3>
            <p className="landing-page__step-description">
              Set up your open play with courts, game mode, and matching preferences.
            </p>
          </div>
          <div className="landing-page__step">
            <span className="landing-page__step-number">2</span>
            <h3 className="landing-page__step-title">Players Check In</h3>
            <p className="landing-page__step-description">
              Players join the queue and get matched based on skill level.
            </p>
          </div>
          <div className="landing-page__step">
            <span className="landing-page__step-number">3</span>
            <h3 className="landing-page__step-title">Play Matches</h3>
            <p className="landing-page__step-description">
              Courts fill automatically with balanced teams. Record scores as you go.
            </p>
          </div>
          <div className="landing-page__step">
            <span className="landing-page__step-number">4</span>
            <h3 className="landing-page__step-title">View Results</h3>
            <p className="landing-page__step-description">
              Track leaderboards, ratings, and achievements in real time.
            </p>
          </div>
        </div>
        <Link to="/create" className="landing-page__cta landing-page__cta--secondary">
          Get Started
        </Link>
      </section>

      {/* Features Section */}
      <section className="landing-page__features" data-testid="landing-page-features">
        <h2 className="landing-page__section-title">Features</h2>
        <div className="landing-page__features-grid">
          <div className="landing-page__feature-card">
            <span className="landing-page__feature-icon" aria-hidden="true">🧠</span>
            <h3 className="landing-page__feature-title">Smart Matchmaking</h3>
            <p className="landing-page__feature-description">
              Skill-based pairing ensures competitive, balanced games every time.
            </p>
          </div>
          <div className="landing-page__feature-card">
            <span className="landing-page__feature-icon" aria-hidden="true">📺</span>
            <h3 className="landing-page__feature-title">Live Spectator View</h3>
            <p className="landing-page__feature-description">
              Share a live link so spectators can follow matches in real time.
            </p>
          </div>
          <div className="landing-page__feature-card">
            <span className="landing-page__feature-icon" aria-hidden="true">🏆</span>
            <h3 className="landing-page__feature-title">Leaderboards</h3>
            <p className="landing-page__feature-description">
              Real-time rankings keep players motivated and competition fierce.
            </p>
          </div>
          <div className="landing-page__feature-card">
            <span className="landing-page__feature-icon" aria-hidden="true">🎖️</span>
            <h3 className="landing-page__feature-title">Achievements</h3>
            <p className="landing-page__feature-description">
              Unlock badges for milestones like win streaks, comebacks, and more.
            </p>
          </div>
        </div>
        <Link to="/create" className="landing-page__cta landing-page__cta--secondary">
          Try It Now
        </Link>
      </section>

      {/* Statistics Section */}
      <section className="landing-page__statistics" data-testid="landing-page-statistics">
        <h2 className="landing-page__section-title">By the Numbers</h2>
        <div className="landing-page__stats-grid">
          <div className="landing-page__stat">
            <span className="landing-page__stat-value">1,000+</span>
            <span className="landing-page__stat-label">Open Plays Created</span>
          </div>
          <div className="landing-page__stat">
            <span className="landing-page__stat-value">5,000+</span>
            <span className="landing-page__stat-label">Matches Played</span>
          </div>
          <div className="landing-page__stat">
            <span className="landing-page__stat-value">2,000+</span>
            <span className="landing-page__stat-label">Players Served</span>
          </div>
        </div>
        <Link to="/create" className="landing-page__cta landing-page__cta--secondary">
          Join the Community
        </Link>
      </section>

      {/* Screenshots Section */}
      <section className="landing-page__screenshots" data-testid="landing-page-screenshots">
        <h2 className="landing-page__section-title">See It in Action</h2>
        <div className="landing-page__screenshots-grid">
          <div className="landing-page__screenshot-placeholder" aria-label="Dashboard screenshot">
            <span className="landing-page__screenshot-icon" aria-hidden="true">📊</span>
            <span className="landing-page__screenshot-caption">Organizer Dashboard</span>
          </div>
          <div className="landing-page__screenshot-placeholder" aria-label="Live view screenshot">
            <span className="landing-page__screenshot-icon" aria-hidden="true">📡</span>
            <span className="landing-page__screenshot-caption">Live Spectator View</span>
          </div>
          <div className="landing-page__screenshot-placeholder" aria-label="Leaderboard screenshot">
            <span className="landing-page__screenshot-icon" aria-hidden="true">🥇</span>
            <span className="landing-page__screenshot-caption">Leaderboard & Stats</span>
          </div>
        </div>
        <Link to="/create" className="landing-page__cta landing-page__cta--secondary">
          Start Open Play
        </Link>
      </section>

      {/* Tagline Section */}
      <section className="landing-page__tagline" data-testid="landing-page-tagline">
        <h2 className="landing-page__tagline-text">
          Ready to level up your pickleball open play?
        </h2>
        <p className="landing-page__tagline-subtitle">
          From casual open play to competitive tournaments — Picklestack has you covered.
        </p>
        <Link to="/create" className="landing-page__cta landing-page__cta--primary">
          Create Open Play
        </Link>
      </section>
    </div>
  );
}

export default LandingPage;
