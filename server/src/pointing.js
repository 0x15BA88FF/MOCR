import { Body, Equator, Horizon, MakeTime, Observer } from "astronomy-engine";
import { log } from "./config.js";

export function computePointing(t, frame, object) {
  if (t.latitude == null || t.longitude == null) return null;
  const unixSec = Number(frame?.serverTime) || Math.floor(Date.now() / 1000);
  try {
    const time = MakeTime(new Date(unixSec * 1000));
    const observer = new Observer(t.latitude, t.longitude, t.elevationM || 0);
    let ra = object?.ra ?? null;
    let dec = object?.dec ?? null;
    let fromEphemeris = false;
    if (object?.type === "sun") {
      const eq = Equator(Body.Sun, time, observer, true, true);
      ra = eq.ra;
      dec = eq.dec;
      fromEphemeris = true;
    } else if (object?.type === "moon") {
      const eq = Equator(Body.Moon, time, observer, true, true);
      ra = eq.ra;
      dec = eq.dec;
      fromEphemeris = true;
    }
    if (ra == null || dec == null) return null;
    const hor = Horizon(time, observer, ra, dec, "normal");
    return {
      ra,
      dec,
      fromEphemeris,
      altAz: {
        altitude: Math.round(hor.altitude * 10) / 10,
        azimuth: Math.round(hor.azimuth * 10) / 10,
      },
    };
  } catch (e) {
    log("alt/az failed:", t.teleUniqueId, e.message);
    return null;
  }
}
