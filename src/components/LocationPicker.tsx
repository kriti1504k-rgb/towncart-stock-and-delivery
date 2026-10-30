import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { LocateFixed, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = { lat: number | null; lng: number | null; onChange: (lat: number | null, lng: number | null) => void };
type Leaflet = typeof import('leaflet');

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const PIN = '<svg width="32" height="40" viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 18 12 18s12-9 12-18C24 5.4 18.6 0 12 0z" fill="#088a3f"/><circle cx="12" cy="12" r="4.5" fill="#fff"/></svg>';

// Map is loaded only in the browser (Leaflet needs `window`). Free OpenStreetMap tiles, no API key.
export function LocationPicker({ lat, lng, onChange }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const lib = useRef<Leaflet | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [ready, setReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState('');

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import('leaflet');
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !box.current || map.current) return;
      const L: Leaflet = (mod as unknown as { default?: Leaflet }).default ?? mod;
      lib.current = L;
      const m = L.map(box.current, { center: [22.9, 79], zoom: 4, scrollWheelZoom: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(m);
      m.on('click', e => onChangeRef.current(round(e.latlng.lat), round(e.latlng.lng)));
      map.current = m;
      setReady(true);
    })();
    return () => { cancelled = true; map.current?.remove(); map.current = null; marker.current = null; setReady(false); };
  }, []);

  // Keep the pin in step with the saved value.
  useEffect(() => {
    const L = lib.current, m = map.current;
    if (!ready || !L || !m) return;
    if (lat === null || lng === null) { marker.current?.remove(); marker.current = null; return; }
    if (!marker.current) {
      const icon = L.divIcon({ className: '', html: PIN, iconSize: [32, 40], iconAnchor: [16, 40] });
      const mk = L.marker([lat, lng], { draggable: true, icon }).addTo(m);
      mk.on('dragend', () => { const p = mk.getLatLng(); onChangeRef.current(round(p.lat), round(p.lng)); });
      marker.current = mk;
      m.setView([lat, lng], Math.max(m.getZoom(), 16));
    } else {
      const p = marker.current.getLatLng();
      if (Math.abs(p.lat - lat) > 1e-7 || Math.abs(p.lng - lng) > 1e-7) marker.current.setLatLng([lat, lng]);
    }
  }, [lat, lng, ready]);

  function locate() {
    setMessage('');
    if (!navigator.geolocation) return void setMessage('This browser cannot share your location. Tap the map to place the pin instead.');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false);
        onChangeRef.current(round(pos.coords.latitude), round(pos.coords.longitude));
        map.current?.setView([pos.coords.latitude, pos.coords.longitude], 17);
      },
      err => {
        setLocating(false);
        setMessage(err.code === 1
          ? 'Location is blocked. Allow location for this site in your browser settings, or tap the map to place the pin.'
          : 'Could not find your location. Tap the map to place the pin instead.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  const pinned = lat !== null && lng !== null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={locate} disabled={locating}><LocateFixed />{locating ? 'Finding you…' : 'Use my current location'}</Button>
        {pinned && <Button type="button" variant="ghost" onClick={() => onChange(null, null)}><X />Remove pin</Button>}
      </div>
      <div className="relative z-0 overflow-hidden rounded-lg border">
        <div ref={box} className="h-60 w-full bg-muted" role="application" aria-label="Map. Tap to place your delivery pin." />
        {!ready && <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Loading map…</p>}
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {message || (pinned ? 'Pin placed. Drag the pin or tap the map to adjust it.' : 'Tap the map to drop a pin on your shop or address.')}
      </p>
    </div>
  );
}
