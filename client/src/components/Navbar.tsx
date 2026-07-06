import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';

function getInitialTheme(): 'dark' | 'light' {
  try {
    const stored = localStorage.getItem('picklestack_theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* ignore */ }
  return 'dark';
}

/**
 * Top navigation bar with logo, app name, and nav links.
 * Displayed on the landing page and create session page.
 */
function Navbar() {
  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('picklestack_theme', theme); } catch { /* ignore */ }
  }, [theme]);

  // Apply theme on mount
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', getInitialTheme());
  }, []);

  function toggleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }

  return (
    <nav className="navbar" aria-label="Main navigation">
      <Link to="/" className="navbar__brand">
        <img src="/logo.png" alt="Picklestack logo" className="navbar__logo" />
        <div className="navbar__brand-text">
          <span className="navbar__app-name">Picklestack</span>
          <span className="navbar__tagline">Smarter Queues. Better Games.</span>
        </div>
      </Link>

      <div className="navbar__links">
        <button
          onClick={toggleTheme}
          className="navbar__theme-toggle"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <Link to="/create" className="navbar__link">
          <span className="navbar__link-icon" aria-hidden="true">🏓</span>
          New Game
        </Link>
      </div>
    </nav>
  );
}

export default Navbar;
