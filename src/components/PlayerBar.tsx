import { useEffect, useRef } from 'react';
import { useApp, usePersistVolume } from '../state/AppContext';

export default function PlayerBar() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { currentChannelId, isPlaying, volume, dispatch } = useApp();
  usePersistVolume(volume);

  // Satu elemen <audio> global: sumber src diganti saat channel berubah.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentChannelId) return;
    audio.src = `/api/ara/content/listen/${currentChannelId}/channel.mp3`;
    audio.load();
  }, [currentChannelId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.play().catch(() => dispatch({ type: 'SET_PLAYING', playing: false }));
    else audio.pause();
  }, [isPlaying, dispatch]);

  return (
    <div className="player-bar">
      <audio
        ref={audioRef}
        onWaiting={() => dispatch({ type: 'SET_PLAYING', playing: true })}
        onPlaying={() => dispatch({ type: 'SET_PLAYING', playing: true })}
        onStalled={() => dispatch({ type: 'SET_PLAYING', playing: true })}
        onError={() => {
          dispatch({ type: 'SET_PLAYING', playing: false });
          // State error ditandai via data-attribute; UI menampilkan "Stream offline".
          document.body.dataset.streamError = 'true';
        }}
      />
      <div className="player-info">
        <span className="station">
          {currentChannelId
            ? `Channel ${currentChannelId}`
            : 'Pilih stasiun dari panel kota'}
        </span>
        <span className="state" aria-live="polite">
          {document.body.dataset.streamError
            ? 'Stream offline'
            : isPlaying
              ? 'Playing'
              : 'Paused'}
        </span>
      </div>
      <button
        type="button"
        onClick={() => dispatch({ type: 'TOGGLE_PLAY' })}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      <label className="volume">
        🔊
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => dispatch({ type: 'SET_VOLUME', volume: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}
