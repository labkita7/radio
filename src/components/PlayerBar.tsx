import { useEffect, useRef, useState } from 'react';
import type { Channel, Place } from '../types';
import { useApp, usePersistVolume } from '../state/AppContext';

interface PlayerBarProps {
  channel: Channel | null;
  place: Place | null;
}

export default function PlayerBar({ channel, place }: PlayerBarProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [streamError, setStreamError] = useState(false);
  const { currentChannelId, isPlaying, volume, dispatch } = useApp();
  usePersistVolume(volume);

  // Satu elemen <audio> global: src diganti saat channel berubah.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !channel?.streamUrl) return;
    setStreamError(false);
    audio.src = channel.streamUrl;
    audio.load();
  }, [channel]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentChannelId) return;
    if (isPlaying) audio.play().catch(() => dispatch({ type: 'SET_PLAYING', playing: false }));
    else audio.pause();
  }, [isPlaying, currentChannelId, dispatch]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

  // Space = play/pause; abaikan saat fokus ada di input agar tidak merusak ketikan.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !currentChannelId) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      dispatch({ type: 'TOGGLE_PLAY' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentChannelId, dispatch]);

  const handleRetry = () => {
    const audio = audioRef.current;
    if (!audio || !channel?.streamUrl) return;
    setStreamError(false);
    audio.src = channel.streamUrl;
    audio.load();
    dispatch({ type: 'SET_PLAYING', playing: true });
  };

  const status = streamError
    ? 'Stream offline'
    : isPlaying
      ? 'Playing'
      : channel
        ? 'Paused'
        : '';

  return (
    <div className="player-bar">
      <audio
        ref={audioRef}
        onWaiting={() => dispatch({ type: 'SET_PLAYING', playing: true })}
        onPlaying={() => dispatch({ type: 'SET_PLAYING', playing: true })}
        onStalled={() => dispatch({ type: 'SET_PLAYING', playing: true })}
        onError={() => {
          dispatch({ type: 'SET_PLAYING', playing: false });
          setStreamError(true);
        }}
      />
      <div className="player-info">
        <span className="station">
          {channel ? channel.title : 'Pilih stasiun dari panel kota'}
        </span>
        <span className="state" aria-live="polite">
          {channel ? [place?.title, status].filter(Boolean).join(' · ') : ''}
        </span>
      </div>
      {streamError && channel && (
        <button type="button" onClick={handleRetry} aria-label="Coba lagi" title="Coba lagi">
          ↻
        </button>
      )}
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
