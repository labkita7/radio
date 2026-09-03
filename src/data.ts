import type { Channel, ChannelsData, PlacesData } from './types';

export interface Dataset {
  places: PlacesData;
  channels: ChannelsData;
  /** channelId -> Channel */
  byId: Map<string, Channel>;
  /** placeId -> Channel[] */
  byPlace: Map<string, Channel[]>;
}

export async function loadDataset(): Promise<Dataset> {
  const [placesRes, channelsRes] = await Promise.all([
    fetch('/data/places.json'),
    fetch('/data/channels.json'),
  ]);
  if (!placesRes.ok || !channelsRes.ok) {
    throw new Error(
      'Dataset tidak ditemukan di /data/. Jalankan `node scripts/harvest.mjs` lalu `node scripts/build-dataset.mjs`.'
    );
  }
  const places = (await placesRes.json()) as PlacesData;
  const channels = (await channelsRes.json()) as ChannelsData;

  if (!places.places || places.places.length < 10_000) {
    throw new Error(
      `Dataset places.json tidak wajar (${places.places?.length ?? 0} tempat) — harvest belum lengkap?`
    );
  }
  if (!channels.channels || channels.channels.length < 20_000) {
    throw new Error(
      `Dataset channels.json tidak wajar (${channels.channels?.length ?? 0} channel) — harvest belum lengkap?`
    );
  }

  const byId = new Map<string, Channel>();
  const byPlace = new Map<string, Channel[]>();
  for (const ch of channels.channels) {
    byId.set(ch.id, ch);
    const list = byPlace.get(ch.placeId);
    if (list) list.push(ch);
    else byPlace.set(ch.placeId, [ch]);
  }
  return { places, channels, byId, byPlace };
}
