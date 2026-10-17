// The course boundary editor's map: tap to drop a circle's launch point or an
// outline's corners, and drag the handles to move them. Loaded only on the
// director's Event tool. While a handle is dragged the shape follows on the
// map itself; the draft changes once, when it is let go, so nothing is rebuilt
// under the finger.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { bearingFrom, METRES_PER_MILE, milesBetween, offsetLatLng } from '../../domain/geo';
import type { LatLng } from '../../domain/types';
import { roundPoint, tapped, type BoundaryDraft } from './boundary';

/** Canyon Ferry, for an event with no course yet. */
const NOWHERE_YET: LatLng = { lat: 46.38917, lng: -111.57556 };

/** Smallest circle a drag can make: a tenth of a mile is a launch, not a course. */
const SMALLEST_MILES = 0.05;

/** A handle's face: text, never markup. */
function handle(text: string, kind: 'corner' | 'centre' | 'radius'): L.DivIcon {
  const face = document.createElement('span');
  face.className = `bnd-handle bnd-handle--${kind}`;
  face.textContent = text;
  return L.divIcon({ className: '', html: face, iconSize: [30, 30], iconAnchor: [15, 15] });
}

const ll = (p: LatLng): [number, number] => [p.lat, p.lng];

export interface BoundaryMapProps {
  readonly draft: BoundaryDraft;
  readonly onChange: (next: BoundaryDraft) => void;
  /** Bumped to frame the shape again: on opening, a change of mode, or a located fix. */
  readonly frame: number;
}

export default function BoundaryMap({ draft, onChange, frame }: BoundaryMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<{ map: L.Map; layers: L.LayerGroup } | null>(null);
  const latest = useRef({ draft, onChange });
  const framed = useRef(-1);
  // Where the radius handle sits around the circle, so it stays where it was
  // last dragged rather than snapping back east.
  const bearing = useRef(Math.PI / 2);

  useEffect(() => {
    latest.current = { draft, onChange };
  });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const m = L.map(el, { zoomControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      crossOrigin: true,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    m.setView(ll(NOWHERE_YET), 12);
    m.on('click', (e: L.LeafletMouseEvent) => {
      const { draft: d, onChange: change } = latest.current;
      const next = tapped(d, e.latlng);
      if (next !== d) change(next);
    });
    map.current = { map: m, layers: L.layerGroup().addTo(m) };
    const resize = new ResizeObserver(() => {
      m.invalidateSize();
    });
    resize.observe(el);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const current = map.current;
    const el = box.current;
    if (!current || !el) return;
    const css = getComputedStyle(el);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const { map: m, layers } = current;
    layers.clearLayers();
    const style: L.PathOptions = {
      color: token('--deep'),
      weight: 2,
      dashArray: '6 4',
      fillColor: token('--olive'),
      fillOpacity: 0.12,
    };
    let shape: { getBounds: () => L.LatLngBounds } | null = null;

    if (draft.kind === 'circle' && draft.center) {
      const centre = draft.center;
      const circle = L.circle(ll(centre), {
        ...style,
        radius: draft.radiusMiles * METRES_PER_MILE,
      }).addTo(layers);
      shape = circle;
      const rimAt = (c: LatLng) => ll(offsetLatLng(c, draft.radiusMiles, bearing.current));
      const mid = L.marker(ll(centre), {
        draggable: true,
        icon: handle('+', 'centre'),
        keyboard: false,
        title: 'Launch point: drag to move the whole circle',
        zIndexOffset: 1000,
      }).addTo(layers);
      const rim = L.marker(rimAt(centre), {
        draggable: true,
        icon: handle('↔', 'radius'),
        keyboard: false,
        title: 'Drag to grow or shrink the circle',
        zIndexOffset: 1000,
      }).addTo(layers);
      mid.on('drag', () => {
        const at = mid.getLatLng();
        circle.setLatLng(at);
        rim.setLatLng(rimAt(at));
      });
      mid.on('dragend', () => {
        latest.current.onChange({ ...draft, center: roundPoint(mid.getLatLng()) });
      });
      rim.on('drag', () => {
        circle.setRadius(
          Math.max(SMALLEST_MILES, milesBetween(centre, rim.getLatLng())) * METRES_PER_MILE,
        );
      });
      rim.on('dragend', () => {
        const at = rim.getLatLng();
        bearing.current = bearingFrom(centre, at);
        const miles = Math.max(SMALLEST_MILES, milesBetween(centre, at));
        latest.current.onChange({ ...draft, radiusMiles: Math.round(miles * 1000) / 1000 });
      });
    }

    if (draft.kind === 'polygon' && draft.points.length > 0) {
      const corners = draft.points.map(ll);
      const outline =
        corners.length >= 3
          ? L.polygon(corners, style).addTo(layers)
          : L.polyline(corners, style).addTo(layers);
      shape = outline;
      draft.points.forEach((p, i) => {
        const corner = L.marker(ll(p), {
          draggable: true,
          icon: handle(String(i + 1), 'corner'),
          keyboard: false,
          title: `Corner ${String(i + 1)}: drag to move it`,
          zIndexOffset: 1000,
        }).addTo(layers);
        corner.on('drag', () => {
          const moved = [...corners];
          moved[i] = [corner.getLatLng().lat, corner.getLatLng().lng];
          outline.setLatLngs(moved);
        });
        corner.on('dragend', () => {
          latest.current.onChange({
            ...draft,
            points: draft.points.map((q, j) => (j === i ? roundPoint(corner.getLatLng()) : q)),
          });
        });
      });
    }

    if (framed.current !== frame) {
      framed.current = frame;
      const bounds = shape?.getBounds();
      if (bounds?.isValid() && !bounds.getNorthEast().equals(bounds.getSouthWest())) {
        m.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
      } else if (bounds?.isValid()) {
        m.setView(bounds.getCenter(), 14);
      }
    }
    // Not on onChange: a parent redrawing for any other reason must not
    // rebuild the handles while one is being dragged.
  }, [draft, frame]);

  return (
    <div
      ref={box}
      className="course-map course-map--tall"
      role="region"
      aria-label="Course boundary map: tap to place it, or type the numbers below"
    />
  );
}
