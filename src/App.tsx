import { useEffect, useState } from 'react';
import Globe from './components/Globe';
import PlacePanel from './components/PlacePanel';
import PlayerBar from './components/PlayerBar';
import { loadDataset, type Dataset } from './data';
import type { Channel, Place } from './types';
import { useApp } from './state/AppContext';

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const { dispatch } = useApp();

  useEffect(() => {
    loadDataset()
      .then((ds) => {
        setDataset(ds);
        if (import.meta.env.DEV) {
          console.log(
            `[radio-globe] dataset: ${ds.places.places.length} places, ${ds.channels.channels.length} channels`
          );
        }
      })
      .catch((e) => setError(String(e)));
  }, []);

  const handlePlay = (channel: Channel) => {
    dispatch({ type: 'PLAY_CHANNEL', channelId: channel.id });
  };

  if (error) {
    return <div className="app-error">Gagal memuat dataset: {error}</div>;
  }
  if (!dataset) {
    return <div className="app-loading">Memuat dataset…</div>;
  }

  return (
    <>
      <Globe dataset={dataset} selectedPlace={selectedPlace} onSelectPlace={setSelectedPlace} />
      <PlacePanel
        place={selectedPlace}
        channels={dataset.channels.channels}
        onPlay={handlePlay}
        onClose={() => setSelectedPlace(null)}
      />
      <PlayerBar />
    </>
  );
}
