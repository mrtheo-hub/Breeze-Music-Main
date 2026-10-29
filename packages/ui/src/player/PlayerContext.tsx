import { createContext, type ReactNode, useContext, useSyncExternalStore } from 'react';
import type { PlayerController, PlayerState } from './controller';

const PlayerCtx = createContext<PlayerController | null>(null);

export function PlayerProvider({ controller, children }: { controller: PlayerController; children: ReactNode }) {
  return <PlayerCtx.Provider value={controller}>{children}</PlayerCtx.Provider>;
}

export function usePlayer(): { state: PlayerState; player: PlayerController } {
  const player = useContext(PlayerCtx);
  if (!player) throw new Error('usePlayer must be used inside <PlayerProvider>');
  const state = useSyncExternalStore(player.subscribe, player.getState);
  return { state, player };
}
