import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import { getSessionHistory, SessionHistoryEntry } from '../sessionHistory';
import { getBlogPosts, type BlogPost } from '../api';
import BlogCard from '../components/BlogCard';

function LandingPage() {
  const recentSessions = getSessionHistory().filter(s => s.status === 'active');
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);

  useEffect(() => {
    getBlogPosts().then(setBlogPosts).catch(() => {});
  }, []);

  return (
    <div className="landing" data-testid="landing-page">
      <Navbar showBlog />

      {/* Hero Section */}
      <section className="landing__hero">
        <div className="landing__hero-content">
          <p className="landing__hero-badge">OPEN PLAY MANAGEMENT</p>
          <h1 className="landing__hero-title">
            Smart matchmaking for your pickleball sessions
          </h1>
          <p className="landing__hero-subtitle">
            Fair court time, skill-balanced teams, and zero repeat opponents — all automated. 
            Just add players and let the algorithm handle the rest.
          </p>
          <div className="landing__hero-actions">
            <Link to="/create" className="landing__btn landing__btn--primary">
              Start Open Play
            </Link>
            <a href="#features" className="landing__btn landing__btn--secondary">
              See How It Works
            </a>
          </div>

          {/* Resume active sessions */}
          {recentSessions.length > 0 && (
            <div className="landing__hero-sessions">
              {recentSessions.slice(0, 2).map((session: SessionHistoryEntry) => (
                <Link key={session.sessionId} to={`/session/${session.sessionId}`} className="landing__session-pill">
                  <span className="landing__session-dot">●</span>
                  <span>{session.name}</span>
                  <span className="landing__session-arrow">→</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="landing__features" id="features">
        <div className="landing__section-inner">
          <h2 className="landing__section-title">Features</h2>
          <p className="landing__section-subtitle">
            Everything you need to run a seamless open play session
          </p>
          <div className="landing__features-grid">
            <div className="landing__feature-card">
              <span className="landing__feature-icon">🧠</span>
              <h3 className="landing__feature-title">Smart Matchmaking</h3>
              <p className="landing__feature-desc">
                Players are paired by skill level for competitive, balanced games every round. No repeat opponents in casual mode.
              </p>
            </div>
            <div className="landing__feature-card">
              <span className="landing__feature-icon">⚖️</span>
              <h3 className="landing__feature-title">Fair Court Time</h3>
              <p className="landing__feature-desc">
                Everyone plays the same number of games — whether solo or paired. The algorithm guarantees equal rotation.
              </p>
            </div>
            <div className="landing__feature-card">
              <span className="landing__feature-icon">📺</span>
              <h3 className="landing__feature-title">Live Spectator View</h3>
              <p className="landing__feature-desc">
                Share a live link so players and spectators can follow matches, queue status, and leaderboards in real time.
              </p>
            </div>
            <div className="landing__feature-card">
              <span className="landing__feature-icon">🏆</span>
              <h3 className="landing__feature-title">Leaderboards & Awards</h3>
              <p className="landing__feature-desc">
                Real-time rankings, MVP awards, streaks, and end-of-session achievements keep players engaged.
              </p>
            </div>
            <div className="landing__feature-card">
              <span className="landing__feature-icon">🔗</span>
              <h3 className="landing__feature-title">Fixed Pairs</h3>
              <p className="landing__feature-desc">
                Lock two players as permanent teammates for the session. They always play together and get fair rotation.
              </p>
            </div>
            <div className="landing__feature-card">
              <span className="landing__feature-icon">📊</span>
              <h3 className="landing__feature-title">Session Analytics</h3>
              <p className="landing__feature-desc">
                Pace tracking, match quality scores, and player stats help you run better sessions every time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="landing__stats">
        <div className="landing__section-inner">
          <h2 className="landing__section-title landing__section-title--light">By the Numbers</h2>
          <div className="landing__stats-grid">
            <div className="landing__stat">
              <span className="landing__stat-value">≤2</span>
              <span className="landing__stat-label">Max game deviation between any two players</span>
            </div>
            <div className="landing__stat">
              <span className="landing__stat-value">0</span>
              <span className="landing__stat-label">Repeat opponents in Casual mode</span>
            </div>
            <div className="landing__stat">
              <span className="landing__stat-value">50+</span>
              <span className="landing__stat-label">Players supported per session</span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="landing__how-it-works">
        <div className="landing__section-inner">
          <h2 className="landing__section-title">How It Works</h2>
          <p className="landing__section-subtitle">Get started in under a minute</p>
          <div className="landing__steps">
            <div className="landing__step">
              <span className="landing__step-number">1</span>
              <h3 className="landing__step-title">Create a Session</h3>
              <p className="landing__step-desc">Set courts, choose a matching mode, and name your session.</p>
            </div>
            <div className="landing__step">
              <span className="landing__step-number">2</span>
              <h3 className="landing__step-title">Add Players</h3>
              <p className="landing__step-desc">Check in players one by one or bulk import. Set skill levels.</p>
            </div>
            <div className="landing__step">
              <span className="landing__step-number">3</span>
              <h3 className="landing__step-title">Start Matches</h3>
              <p className="landing__step-desc">Tap "GO" on a court and the algorithm picks the next 4 players.</p>
            </div>
            <div className="landing__step">
              <span className="landing__step-number">4</span>
              <h3 className="landing__step-title">Track & Share</h3>
              <p className="landing__step-desc">Live leaderboard, awards, and a shareable spectator view.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Blog Section */}
      <section className="landing__blog">
        <div className="landing__section-inner">
          <h2 className="landing__section-title">From the Blog</h2>
          <p className="landing__section-subtitle">
            News, tips, and updates from the court
          </p>
          {blogPosts.length > 0 ? (
            <div className="landing__blog-grid">
              {blogPosts.slice(0, 3).map((post) => (
                <BlogCard key={post.id} post={post} />
              ))}
            </div>
          ) : (
            <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              No posts yet — check back soon!
            </p>
          )}
          {blogPosts.length > 3 && (
            <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
              <Link to="/blog" className="landing__btn landing__btn--secondary">
                View All Posts
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Final CTA */}
      <section className="landing__cta-section">
        <div className="landing__section-inner">
          <h2 className="landing__cta-title">Ready to run your next open play?</h2>
          <p className="landing__cta-subtitle">
            No sign-up required. Create a session and start playing in seconds.
          </p>
          <Link to="/create" className="landing__btn landing__btn--primary landing__btn--large">
            Create Open Play
          </Link>
        </div>
      </section>
    </div>
  );
}

export default LandingPage;
