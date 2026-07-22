import { Link } from 'react-router-dom';

function Footer() {
  return (
    <footer className="footer">
      <Link to="/" className="footer__brand">
        <img src="/logo.png" alt="PicklStack" className="footer__logo" />
      </Link>
      <p className="footer__copy">&copy; 2026 PicklStack. All rights reserved.</p>
    </footer>
  );
}

export default Footer;
