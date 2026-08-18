import { json } from "../responses.js";
import { log } from "../config.js";
import { api } from "../sloohClient.js";
import {
  telescopeById,
  slooh1000CategoriesCache,
  SLOOH1000_CATEGORIES_TTL,
  slooh1000ObjectsCache,
  SLOOH1000_OBJECTS_TTL,
} from "../state.js";

const PRODUCT_ID = "adfb3d74-e551-11e9-a8f4-06b2ab7e8ae4";
const SOURCE_PAGE = "https://app.slooh.com/missions/bySlooh1000";

const TYPE_ICONS = {
  planet: "Jupiter_w",
  "minor planet": "Asteroid_w",
  comet: "Comet_w",
  moon: "Moon_w",
  "open cluster": "StarCluster_w",
  "globular cluster": "StarCluster_w",
  "emission nebula": "Nebula_w",
  "reflection nebula": "Nebula_w",
  "dark nebula": "Nebula_w",
  "planetary nebula": "Nebula_w",
  "supernova remnant": "Nebula_w",
  galaxy: "Galaxy_w",
  "spiral galaxy": "Galaxy_w",
  "elliptical galaxy": "Galaxy_w",
  "irregular galaxy": "Galaxy_w",
};

export function defaultObjectIcon(objectType) {
  const slug = TYPE_ICONS[String(objectType || "").toLowerCase()] || "Nebula_w";
  return "https://vega.slooh.com/icons/objects/" + slug + ".svg";
}

function telescopeName(obsId, domeId, telescopeId) {
  for (const t of telescopeById.values()) {
    if (
      t.obsId === obsId &&
      t.telescopeId === telescopeId &&
      (domeId == null || Number(t.domeId) === Number(domeId))
    )
      return t.telescopeName || null;
  }
  return null;
}

export function mapSlooh1000Categories(d) {
  return (d.itemList || [])
    .filter((i) => i.itemIsEnabled && i.typeName)
    .map((i) => ({
      typeName: i.typeName,
      displayName: i.itemDisplayName,
      iconURL: i.itemIconURL || null,
      displayOrder: i.displayOrder ?? null,
    }));
}

export function mapSlooh1000Object(o) {
  return {
    objectId: o.objectId ?? null,
    objectTitle: o.objectTitle || null,
    objectType: o.objectType || null,
    objectDescription: o.objectDescription || null,
    objectIconURL:
      o.objectIconURL || defaultObjectIcon(o.objectType),
    scheduledMissionId: o.scheduledMissionId ?? null,
    missionStart: o.missionStart ?? null,
    missionStartFormatted: o.missionStartFormatted || null,
    obsId: o.obsId || null,
    domeId: o.domeId ?? null,
    telescopeId: o.telescopeId || null,
    telescopeName: telescopeName(o.obsId, o.domeId, o.telescopeId),
    slotType: o.slotType || null,
    missionAvailable: o.missionAvailable ?? false,
  };
}

export function mapSlooh1000Slot(m) {
  return {
    scheduledMissionId: m.scheduledMissionId ?? null,
    uniqueId: m.uniqueId || null,
    missionStart: m.missionStart ?? null,
    durationSec: m.durationSec ?? null,
    slotStatus: m.slotStatus || null,
    missionType: m.missionType || null,
    missionAvailable: m.missionAvailable ?? false,
    explanation: m.explanation || null,
    title: m.objectTitle || m.title || null,
    userHasReservation: m.userHasReservation ?? false,
  };
}

export function handleSlooh1000Categories(req, res, url, pathname) {
  (async () => {
    try {
      const cached = slooh1000CategoriesCache.get("categories");
      if (cached && Date.now() - cached.fetchedAt < SLOOH1000_CATEGORIES_TTL) {
        json(res, 200, { timestamp: Date.now(), categories: cached.data });
        return;
      }
      const d = await api("/api/reservation/getSlooh1000CategoryList", {
        callSource: "bySlooh1000V4",
        locale: "en",
      });
      if (d.apiError) throw new Error(JSON.stringify(d.errorMsg || d));
      const categories = mapSlooh1000Categories(d);
      slooh1000CategoriesCache.set("categories", {
        data: categories,
        fetchedAt: Date.now(),
      });
      json(res, 200, { timestamp: Date.now(), categories });
    } catch (e) {
      log("slooh1000 categories failed:", e.message);
      json(res, 502, { error: e.message });
    }
  })();
}

export function handleSlooh1000Objects(req, res, url, pathname) {
  const typeName = (url.searchParams.get("typeName") || "").trim();
  const nameFrom = url.searchParams.get("nameFrom") || "";
  const nameTo = url.searchParams.get("nameTo") || "";
  const key = typeName + "|" + nameFrom + "|" + nameTo;
  (async () => {
    try {
      if (!typeName) {
        json(res, 400, { error: "missing typeName (?typeName=...)" });
        return;
      }
      const cached = slooh1000ObjectsCache.get(key);
      if (cached && Date.now() - cached.fetchedAt < SLOOH1000_OBJECTS_TTL) {
        json(res, 200, { timestamp: Date.now(), ...cached.data });
        return;
      }
      const d = await api("/api/reservation/getSlooh1000ObjectList", {
        typeName,
        nameFrom,
        nameTo,
        includeDescription: true,
        callSource: "bySlooh1000V4",
        locale: "en",
        productId: PRODUCT_ID,
        sourcePageViewedURL: SOURCE_PAGE,
      });
      if (d.apiError) throw new Error(JSON.stringify(d.errorMsg || d));
      const data = {
        typeName: d.typeName || typeName,
        expires: d.expires ?? null,
        availableMissionsCount: d.availableMissionsCount ?? 0,
        objectCount: d.objectCount ?? 0,
        objects: (d.objectList || []).map(mapSlooh1000Object),
      };
      slooh1000ObjectsCache.set(key, { data, fetchedAt: Date.now() });
      json(res, 200, { timestamp: Date.now(), ...data });
    } catch (e) {
      log("slooh1000 objects failed:", key, e.message);
      json(res, 502, { error: e.message });
    }
  })();
}

export function handleSlooh1000SlotPreview(req, res, url, pathname) {
  (async () => {
    try {
      const q = url.searchParams;
      const scheduledMissionId = q.get("scheduledMissionId");
      const missionStart = q.get("missionStart");
      const objectId = q.get("objectId");
      if (!scheduledMissionId || !missionStart || !objectId) {
        json(res, 400, {
          error: "missing scheduledMissionId/missionStart/objectId",
        });
        return;
      }
      const d = await api("/api/reservation/grabMissionSlot", {
        scheduledMissionId,
        callSource: "bySlooh1000V4",
        missionType: q.get("missionType") || "member",
        missionStart,
        obsId: q.get("obsId") || "",
        domeId: q.get("domeId") || 0,
        telescopeId: q.get("telescopeId") || "",
        objectId,
        objectType: q.get("objectType") || null,
        objectTitle: q.get("objectTitle") || null,
        objectRA: "",
        objectDec: "",
        catalog: "",
        catName: "",
        designation: "",
        processingRecipe: {},
        objectIconURL: q.get("objectIconURL") || "",
        uniqueId: q.get("uniqueId") || "",
        targetName: q.get("objectTitle") || null,
        objective: "",
      });
      if (d.apiError) throw new Error(JSON.stringify(d.errorMsg || d));
      const m = (d.missionList || [])[0] || {};
      json(res, 200, {
        timestamp: Date.now(),
        missionAvailable: d.missionAvailable ?? false,
        explanation: d.explanation || m.explanation || null,
        slot: mapSlooh1000Slot(m),
      });
    } catch (e) {
      log("slooh1000 slot preview failed:", e.message);
      json(res, 502, { error: e.message });
    }
  })();
}
