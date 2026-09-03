import { useEffect, useMemo } from 'react';
import type { Channel, Place } from '../types';
import { useApp } from '../state/AppContext';

interface PlacePanelProps {
  place: Place | null;
  channels: Channel[];
  onPlay: (channel: Channel) => void;
  onClose: () => void;
}

export default function PlacePanel({ place, channels, onPlay, onClose }: PlacePanelProps) {
  const { currentChannelId, isPlaying } = useApp();

  const placeChannels = useMemo(
    () => (place ? channels.filter((c) => c.placeId === place.id) : []),
    [place, channels]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!place) return null;

  return (
    <aside className="place-panel" role="dialog" aria-label={place.title}>
      <header>
        <div>
          <h2>{place.title}</h2>
          {place.country && <span className="country">{place.country}</span>}
        </div>
        <button type="button" className="close" onClick={onClose} aria-label="Tutup panel">
          ✕
        </button>
      </header>
      <ul className="stations">
        {placeChannels.length === 0 && <li className="empty">Tidak ada stasiun.</li>}
        {placeChannels.map((ch) => {
          const disabled = ch.streamUrl == null;
          const active = ch.id === currentChannelId;
          return (
            <li key={ch.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPlay(ch)}
                className={active ? 'active' : ''}
                title={disabled ? 'unavailable' : ch.title}
              >
                <span className="name">{ch.title}</span>
                {disabled && <span className="badge">unavailable</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {currentChannelId && (
        <div className="playing-hint" aria-live="polite">
          {isPlaying ? 'Memutar…' : 'Dijeda'}
        </div>
      )}
    </aside>
  );
}
