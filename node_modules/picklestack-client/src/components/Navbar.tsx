import { Link } from 'react-router-dom';

/**
 * Top navigation bar with logo, app name, and nav links.
 * Displayed on the landing page and create session page.
 */
function Navbar() {
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
        <Link to="/create" className="navbar__link">
          <span className="navbar__link-icon" aria-hidden="true">🏓</span>
          New Game
        </Link>
      </div>
    </nav>
  );
}

export default Navbar;
