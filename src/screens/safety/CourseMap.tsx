// The course on a map: on the Safety screen with this phone, its entry's
// catches and any raised beacons; on the director's Positions with every
// angler's last position. Loaded only there, and only a nicety: the tiles
// need signal, and everything that decides in or out is worked out on the
// phone without them.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { boundaryCenter, boundaryIsUsable, METRES_PER_MILE, type Boundary } from '../../domain/geo';
import type { LatLng } from '../../domain/types';

export interface MapPin extends LatLng {
  readonly label: string;
}

export interface CourseMapProps {
  readonly course: Boundary;
  readonly me: LatLng | null;
  readonly beacons: readonly MapPin[];
  readonly catches?: readonly (MapPin & { readonly outside: boolean })[];
  /** The director's view: where each angler last reported from. */
  readonly anglers?: readonly (MapPin & { readonly stale: boolean })[];
  /** What the map is, for a screen reader. */
  readonly label?: string;
}

/** Canyon Ferry, for an event with no course and a phone with no fix yet. */
const NOWHERE_YET: LatLng = { lat: 46.38917, lng: -111.57556 };

/** Text, never markup: handles and species are typed by people. */
function label(text: string): HTMLElement {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

function courseShape(course: Boundary, style: L.PathOptions): L.Layer | null {
  if (!boundaryIsUsable(course)) return null;
  if (course.kind === 'circle') {
    return L.circle([course.center.lat, course.center.lng], {
      ...style,
      radius: course.radiusMiles * METRES_PER_MILE,
    });
  }
  return L.polygon(
    course.points.map((p) => [p.lat, p.lng] as [number, number]),
    style,
  );
}

export default function CourseMap({
  course,
  me,
  beacons,
  catches = [],
  anglers = [],
  label: name = 'Course map, with your position and any raised beacons',
}: CourseMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<{ map: L.Map; layers: L.LayerGroup; framed: boolean } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const m = L.map(el, { zoomControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      // Fetched with CORS, so the offline cache can keep each tile it has seen.
      crossOrigin: true,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    const centre = boundaryCenter(course, NOWHERE_YET);
    m.setView([centre.lat, centre.lng], 12);
    map.current = { map: m, layers: L.layerGroup().addTo(m), framed: false };
    // Leaflet keeps the size it was built at; a rotated phone needs it read again.
    const resize = new ResizeObserver(() => {
      m.invalidateSize();
    });
    resize.observe(el);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
    };
    // Built once; what is drawn on it follows the props below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const current = map.current;
    const el = box.current;
    if (!current || !el) return;
    const css = getComputedStyle(el);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const { map: m, layers } = current;
    layers.clearLayers();

    const shape = courseShape(course, {
      color: token('--deep'),
      weight: 2,
      fillColor: token('--olive'),
      fillOpacity: 0.12,
    });
    shape?.addTo(layers);

    for (const c of catches) {
      L.circleMarker([c.lat, c.lng], {
        radius: 5,
        weight: 2,
        color: c.outside ? token('--danger') : token('--olive'),
        fillColor: c.outside ? token('--status-rejected-bg') : token('--status-approved-bg'),
        fillOpacity: 1,
      })
        .bindTooltip(label(c.label))
        .addTo(layers);
    }
    for (const a of anglers) {
      L.circleMarker([a.lat, a.lng], {
        radius: 6,
        weight: 2,
        color: a.stale ? token('--steel') : token('--deep'),
        fillColor: a.stale ? token('--paper-2') : token('--vf-cyan'),
        fillOpacity: 1,
      })
        .bindTooltip(label(a.label))
        .addTo(layers);
    }
    // Beacons go on after everything else, so they sit on top.
    for (const b of beacons) {
      L.circleMarker([b.lat, b.lng], {
        radius: 10,
        weight: 3,
        color: token('--white'),
        fillColor: token('--beacon-red'),
        fillOpacity: 1,
      })
        .bindTooltip(label(`${b.label} needs help`))
        .addTo(layers);
    }
    if (me) {
      L.circleMarker([me.lat, me.lng], {
        radius: 7,
        weight: 3,
        color: token('--deep'),
        fillColor: token('--vf-cyan'),
        fillOpacity: 1,
      })
        .bindTooltip(label('You'))
        .addTo(layers);
    }

    if (!current.framed) {
      if (shape instanceof L.Circle || shape instanceof L.Polygon) {
        m.fitBounds(shape.getBounds(), { padding: [24, 24], maxZoom: 15 });
        current.framed = true;
      } else if (me) {
        m.setView([me.lat, me.lng], 13);
        current.framed = true;
      } else if (anglers.length + beacons.length > 0) {
        // No course drawn: frame wherever the field is.
        const all = [...anglers, ...beacons].map((p) => [p.lat, p.lng] as [number, number]);
        m.fitBounds(L.latLngBounds(all), { padding: [24, 24], maxZoom: 14 });
        current.framed = true;
      }
    } else if (me && !boundaryIsUsable(course)) {
      m.panTo([me.lat, me.lng]);
    }
  }, [course, me, beacons, catches, anglers]);

  return <div ref={box} className="course-map" role="region" aria-label={name} />;
}
