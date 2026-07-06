import { Link } from 'react-router-dom';

interface SidebarProps {
  activeRoute: string;
}

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  { path: '/session', label: 'Dashboard', icon: '📊' },
  { path: '/live', label: 'Live View', icon: '📺' },
  { path: '/players', label: 'Players', icon: '👥' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

function isActiveRoute(currentPath: string, itemPath: string): boolean {
  if (itemPath === '/session') {
    return currentPath.startsWith('/session');
  }
  if (itemPath === '/live') {
    return currentPath.startsWith('/live');
  }
  return currentPath === itemPath;
}

export default function Sidebar({ activeRoute }: SidebarProps) {
  return (
    <nav className="sidebar sidebar--collapsed sidebar--expanded" aria-label="Main navigation">
      <div className="sidebar__nav">
        {navItems.map((item) => {
          const active = isActiveRoute(activeRoute, item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item${active ? ' nav-item--active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className="nav-item__icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="nav-item__label">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
