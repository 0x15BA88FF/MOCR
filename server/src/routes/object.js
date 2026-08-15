import { json } from "../responses.js";
import { catalog } from "../state.js";
import { api } from "../sloohClient.js";
import { getObjectInfo } from "../objects.js";
import { computePointing } from "../pointing.js";

export function handleObject(req, res, url, pathname) {
  const objectId = url.searchParams.get("objectId");
  if (!objectId) {
    json(res, 400, { error: "missing objectId parameter" });
    return;
  }
  (async () => {
    try {
      const d = await api("/api/object/getObjectData", {
        objectId,
        callSource: "details",
      });
      json(res, 200, d);
    } catch (e) {
      json(res, 502, { error: e.message });
    }
  })();
}

export function handleObjectSummary(req, res, url, pathname) {
  const objectId = url.searchParams.get("objectId");
  if (!objectId) {
    json(res, 400, { error: "missing objectId parameter" });
    return;
  }
  (async () => {
    try {
      const object = await getObjectInfo(objectId);
      let site = null;
      const obsName = url.searchParams.get("obsName");
      const timeSec = Number(url.searchParams.get("time")) || 0;
      let resolved = object;
      if (object && obsName) {
        const t = catalog.find((x) => x.obsName === obsName) ?? null;
        if (t) {
          site = {
            name: t.obsName,
            latitude: t.latitude,
            longitude: t.longitude,
            elevationM: t.elevationM,
          };
          if (timeSec) {
            const pointing = computePointing(
              t,
              { serverTime: timeSec },
              object,
            );
            if (pointing) {
              resolved = {
                ...object,
                ...(pointing.fromEphemeris
                  ? {
                      ra: pointing.ra,
                      dec: pointing.dec,
                      coordinatesDisplay: null,
                    }
                  : {}),
                altAz: pointing.altAz,
              };
            }
          }
        }
      }
      json(res, 200, { object: resolved, site });
    } catch (e) {
      json(res, 502, { error: e.message });
    }
  })();
}
