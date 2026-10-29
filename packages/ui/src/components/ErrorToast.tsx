import { X } from 'lucide-react';
import { useEffect } from 'react';
import { usePlayer } from '../player/PlayerContext';

const TOAST_MS = 6000;

export function ErrorToast() {
  const { state, player } = usePlayer();
  const { error } = state;

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => player.dismissError(), TOAST_MS);
    return () => clearTimeout(id);
  }, [error, player]);

  if (!error) return null;
  return (
    <div className="toast" role="status">
      <span>{error}</span>
      <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => player.dismissError()}>
        <X size={16} />
      </button>
    </div>
  );
}
