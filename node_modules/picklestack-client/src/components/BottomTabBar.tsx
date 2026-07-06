import { Link } from 'react-router-dom';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/live', label: 'Live View', icon: '📺' },
  { path: '/players', label: 'Players', icon: '👥' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

interface BottomTabBarProps {
  activeRoute: string;
}

function isActiveRoute(currentPath: string, itemPath: string): boolean {
  if (itemPath === '/') {
    return currentPath === '/' || currentPath.startsWith('/session');
  }
  return currentPath.startsWith(itemPath);
}

function BottomTabBar({ activeRoute }: BottomTabBarProps) {
  return (
    <nav className="bottom-tab-bar" aria-label="Main navigation">
      {NAV_ITEMS.map((item) => {
        const active = isActiveRoute(activeRoute, item.path);
        const className = active ? 'nav-item nav-item--active' : 'nav-item';

        return (
          <Link
            key={item.path}
            to={item.path}
            className={className}
            aria-current={active ? 'page' : undefined}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default BottomTabBar;
