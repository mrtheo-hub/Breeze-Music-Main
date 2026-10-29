import { House, type LucideIcon, Search, Wind } from 'lucide-react';
import { useState } from 'react';
import { HomeScreen } from '../screens/HomeScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { ErrorToast } from './ErrorToast';
import { PlayerBar } from './PlayerBar';

type Route = 'home' | 'search';

const NAV: { route: Route; label: string; icon: LucideIcon }[] = [
  { route: 'home', label: 'Home', icon: House },
  { route: 'search', label: 'Search', icon: Search },
];

export function AppShell() {
  const [route, setRoute] = useState<Route>('home');
  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <Wind size={22} aria-hidden="true" />
          Breeze
        </div>
        {NAV.map(({ route: r, label, icon: Icon }) => (
          <button
            key={r}
            type="button"
            className="nav-btn"
            aria-current={route === r ? 'page' : undefined}
            onClick={() => setRoute(r)}
          >
            <Icon size={20} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>
      <main className="content">{route === 'home' ? <HomeScreen /> : <SearchScreen />}</main>
      <PlayerBar />
      <ErrorToast />
    </div>
  );
}
