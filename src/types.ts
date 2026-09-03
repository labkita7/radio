export interface Place {
  id: string;
  title: string;
  country: string | null;
  lat: number;
  lng: number;
  size: number;
}

export interface Channel {
  id: string;
  placeId: string;
  title: string;
  slug: string;
  streamUrl: string | null;
  format: string | null;
  insecure: boolean;
}

export interface PlacesData {
  countries: string[];
  places: Place[];
}

export interface ChannelsData {
  channels: Channel[];
}
