import { api, cleanHtml } from "./sloohClient.js";
import { objectCache, OBJECT_CACHE_TTL } from "./state.js";
import { log } from "./config.js";

export async function getObjectInfo(objectId) {
  if (!objectId || objectId === "0") return null;
  const hit = objectCache.get(objectId);
  if (hit && Date.now() - hit.fetchedAt < OBJECT_CACHE_TTL) return hit.data;
  try {
    const d = await api("/api/object/getObjectData", {
      objectId,
      callSource: "details",
    });
    const info = {
      name: d.objectTitle || null,
      description: d.objectDescription || null,
      audioURL: d.objectAudioURL || null,
      type: d.objectType || null,
      constellation: d.objectConstellation || null,
      ra: typeof d.objectRA === "number" ? d.objectRA : null,
      dec: typeof d.objectDeclination === "number" ? d.objectDeclination : null,
      sizeArcSeconds: Number(d.objectSizeArcSeconds) || null,
      magnitude: d.objectMagnitudeDisplay || d.objectMagnitude || null,
      distance: d.objectDistance || null,
      coordinatesDisplay: cleanHtml(d.objectCoordinatesDisplay),
    };
    objectCache.set(objectId, { data: info, fetchedAt: Date.now() });
    return info;
  } catch (e) {
    log("object info failed:", objectId, e.message);
    return null;
  }
}
