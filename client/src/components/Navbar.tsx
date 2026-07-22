import { useState } from 'react';
import { Link } from 'react-router-dom';

interface NavbarProps {
  showBlog?: boolean;
}

function Navbar({ showBlog }: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="navbar" aria-label="Main navigation">
      <Link to="/" className="navbar__brand" onClick={() => setMenuOpen(false)}>
        <img src="/logo.png" alt="PicklStack logo" className="navbar__logo" />
      </Link>

      <button
        className="navbar__burger"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Toggle menu"
        aria-expanded={menuOpen}
      >
        <span className={`navbar__burger-line ${menuOpen ? 'open' : ''}`} />
        <span className={`navbar__burger-line ${menuOpen ? 'open' : ''}`} />
        <span className={`navbar__burger-line ${menuOpen ? 'open' : ''}`} />
      </button>

      <div className={`navbar__links ${menuOpen ? 'navbar__links--open' : ''}`}>
        {showBlog && (
          <Link to="/blog" className="navbar__link" onClick={() => setMenuOpen(false)}>
            <span className="navbar__link-icon" aria-hidden="true">📝</span>
            Blog
          </Link>
        )}
        <Link to="/create" className="navbar__link" onClick={() => setMenuOpen(false)}>
          <span className="navbar__link-icon" aria-hidden="true">🏓</span>
          New Game
        </Link>
      </div>
    </nav>
  );
}

export default Navbar;
