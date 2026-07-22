import { Link } from 'react-router-dom';

interface NavbarProps {
  showBlog?: boolean;
}

function Navbar({ showBlog }: NavbarProps) {
  return (
    <nav className="navbar" aria-label="Main navigation">
      <Link to="/" className="navbar__brand">
        <img src="/logo.png" alt="PaddleFlux logo" className="navbar__logo" />
      </Link>

      <div className="navbar__links">
        {showBlog && (
          <Link to="/blog" className="navbar__link">
            <span className="navbar__link-icon" aria-hidden="true">📝</span>
            Blog
          </Link>
        )}
        <Link to="/create" className="navbar__link">
          <span className="navbar__link-icon" aria-hidden="true">🏓</span>
          New Game
        </Link>
      </div>
    </nav>
  );
}

export default Navbar;
