// Where the phone is, when a catch is filed. Never waits long: a fix is
// evidence worth having, not a reason to keep an angler holding a fish.
import { METRES_PER_MILE } from '../domain/geo';

export interface Fix {
  readonly lat: number;
  readonly lng: number;
  readonly accuracyMiles: number;
}

/** A fresh fix within `timeoutMs`, or null: no permission, no fix, or no GPS at all. */
export function currentFix(timeoutMs = 6000): Promise<Fix | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null);
      return;
    }
    const giveUp = setTimeout(() => {
      resolve(null);
    }, timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(giveUp);
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyMiles: pos.coords.accuracy / METRES_PER_MILE,
        });
      },
      () => {
        clearTimeout(giveUp);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs - 500, maximumAge: 5000 },
    );
  });
}
