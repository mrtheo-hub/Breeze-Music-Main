import { AppShell } from './components/AppShell';
import type { PlayerController } from './player/controller';
import { PlayerProvider, usePlayer } from './player/PlayerContext';
import { useMediaSession } from './player/useMediaSession';
import { type Services, ServicesProvider } from './services';

export function App({ player, services }: { player: PlayerController; services: Services }) {
  return (
    <ServicesProvider services={services}>
      <PlayerProvider controller={player}>
        <MediaSessionBridge />
        <AppShell />
      </PlayerProvider>
    </ServicesProvider>
  );
}

function MediaSessionBridge() {
  const { player, state } = usePlayer();
  useMediaSession(player, state);
  return null;
}
