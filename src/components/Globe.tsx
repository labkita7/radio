import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Place } from '../types';
import type { Dataset } from '../data';

interface GlobeProps {
  dataset: Dataset;
  selectedPlace: Place | null;
  onSelectPlace: (place: Place | null) => void;
}

const STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#05070d' } }],
};

/** GeoJSON titik tempat dibangun sekali dari places.json. */
function placesGeoJSON(dataset: Dataset) {
  return {
    type: 'FeatureCollection',
    features: dataset.places.places.map((p) => ({
      type: 'Feature',
      properties: { id: p.id, title: p.title, size: p.size },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    })),
  };
}

export default function Globe({ dataset, selectedPlace, onSelectPlace }: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  
  const selectRef = useRef(onSelectPlace);
  selectRef.current = onSelectPlace;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: [10, 15],
      zoom: 1.6,
      attributionControl: false,
    });
    mapRef.current = map;
    // Hook dev-only untuk pengujian headless (WebGL via swiftshader).
    if (import.meta.env.DEV) (window as any).__rgMap = map;
    map.setProjection({ type: 'globe' });

    map.on('load', () => {
      map.addSource('countries', { type: 'geojson', data: '/data/world.geojson' });
      map.addLayer({
        id: 'countries-fill',
        type: 'fill',
        source: 'countries',
        paint: {
          'fill-color': '#1f2a4a',
          'fill-outline-color': '#2c3a63',
        },
      });

      map.addSource('places', {
        type: 'geojson',
        data: placesGeoJSON(dataset),
      });
      map.addLayer({
        id: 'places-circle',
        type: 'circle',
        source: 'places',
        paint: {
          'circle-color': '#ffffff',
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            1,
            ['interpolate', ['linear'], ['coalesce', ['get', 'size'], 1], 1, 1.4, 10, 2.6, 60, 5],
            7,
            ['interpolate', ['linear'], ['coalesce', ['get', 'size'], 1], 1, 4, 10, 7, 60, 14],
          ],
          'circle-opacity': 0.85,
          'circle-stroke-width': 0.5,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-opacity': 0.3,
        },
      });
    });

    // Cursor pointer saat hover di atas titik tempat.
    map.on('mousemove', (e) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: ['places-circle'] });
      map.getCanvas().style.cursor = hits.length ? 'pointer' : '';
    });

    // Klik: pilih tempat terdekat dari proyeksi koordinat (toleransi ~12px).
    map.on('click', (e) => {
      const candidates: { place: Place; px: number }[] = [];
      for (const p of dataset.places.places) {
        const proj = map.project([p.lng, p.lat]);
        if (proj.x == null) continue;
        const dx = proj.x - e.point.x;
        const dy = proj.y - e.point.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 12) candidates.push({ place: p, px: dist });
      }
      if (candidates.length) {
        candidates.sort((a, b) => a.px - b.px);
        selectRef.current(candidates[0].place);
      }
    });

    // Auto-rotate pelan sampai interaksi pertama.
    let autoRotate = true;
    const tick = () => {
      if (autoRotate && map.getZoom() < 5) {
        map.setCenter([map.getCenter().lng + 0.05, map.getCenter().lat]);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const stopRotate = () => {
      autoRotate = false;
    };
    map.on('dragstart', stopRotate);
    map.on('click', stopRotate);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // flyTo saat tempat terpilih; kembali ke globe bebas saat null.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (selectedPlace) {
      map.flyTo({ center: [selectedPlace.lng, selectedPlace.lat], zoom: 7 });
    } else {
      map.flyTo({ zoom: Math.min(map.getZoom(), 2.2) });
    }
  }, [selectedPlace]);

  return <div ref={containerRef} className="globe-container" />;
}
