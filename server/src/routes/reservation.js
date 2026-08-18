import { json, readBody } from "../responses.js";
import { log } from "../config.js";
import { api } from "../sloohClient.js";
import { getObjectInfo } from "../objects.js";
import { defaultObjectIcon } from "./slooh1000.js";
import {
  telescopeById,
  missionLimitsCache,
  MISSION_LIMITS_TTL,
  missionDatesCache,
  MISSION_DATES_TTL,
  missionSlotsCache,
  MISSION_SLOTS_TTL,
} from "../state.js";

export function mapMissionLimits(d) {
  return {
    allowMissionReservation: d.allowMissionReservation ?? false,
    showMissions: d.showMissions ?? false,
    missionQuota: {
      maxCount: d.missionMaxCount ?? 0,
      inUseCount: d.missionInUseCount ?? 0,
      availableCount: d.missionAvailableCount ?? 0,
    },
    missionsQuotaMsg: d.missionsQuotaMsg || null,
    missionsLimitMsg: d.missionsLimitMsg || null,
    showAdvancedMissions: d.showAdvancedMissions ?? false,
    allowAdvancedMissionReservation: d.allowAdvancedMissionReservation ?? false,
    advancedMissionQuota: {
      maxCount: d.advancedMissionMaxCount ?? 0,
      inUseCount: d.advancedMissionInUseCount ?? 0,
      availableCount: d.advancedMissionAvailableCount ?? 0,
    },
    advancedMissionsQuotaMsg: d.advancedMissionsQuotaMsg || null,
    advancedMissionsLimitMsg: d.advancedMissionsLimitMsg || null,
  };
}

function mapSlotDetailed(s) {
  return {
    scheduledMissionId: s.scheduledMissionId ?? null,
    uniqueId: s.uniqueId ?? null,
    missionStart: s.missionStart ?? null,
    durationSec: s.durationSec ?? null,
    expires: s.expires ?? null,
    slotStatus: s.slotStatus || null,
    missionType: s.missionType || null,
    slotTitle: s.slotTitle || null,
    allowButtons: {
      browse: s.showBrowseButton ?? false,
      slooh1000: s.showSlooh1000Button ?? false,
      constellation: s.showConstellationButton ?? false,
      catalog: s.showCatalogButton ?? false,
      coordinate: s.showCoordinateButton ?? false,
      piggyback: s.showPiggybackButton ?? false,
      join: s.showJoinMissionButton ?? false,
    },
    userHasReservation: s.userHasReservation ?? false,
    userReservationType: s.userReservationType || null,
    userHasHold: s.userHasHold ?? false,
    owner: s.ownerDisplayName || null,
    ownerMembershipType: s.ownerMembershipType || null,
  };
}

function resolveTelescope(body) {
  const t = telescopeById.get(body.teleUniqueId);
  if (t && t.obsId && t.telescopeId) return t;
  return (
    catalogLookup(body.obsId, body.domeId, body.telescopeId) || null
  );
}

function catalogLookup(obsId, domeId, telescopeId) {
  for (const t of telescopeById.values()) {
    if (
      t.obsId === obsId &&
      t.telescopeId === telescopeId &&
      domeId != null &&
      Number(t.domeId) === Number(domeId)
    )
      return t;
  }
  return (
    [...telescopeById.values()].find(
      (t) =>
        t.obsId === obsId &&
        t.telescopeId === telescopeId &&
        (domeId == null || Number(t.domeId) === Number(domeId)),
    ) || null
  );
}

function reservePayload(t, body) {
  const o = body.object || {};
  return {
    scheduledMissionId: body.scheduledMissionId,
    callSource: body.callSource || "byTelescope",
    missionType: body.missionType || "member",
    missionStart: body.missionStart,
    slotType: body.slotType || null,
    objectId: o.objectId,
    objectType: o.objectType || null,
    objectTitle: o.objectTitle || null,
    objectRA: o.objectRA ?? "",
    objectDec: o.objectDec ?? "",
    catalog: o.catalog ?? "",
    catName: o.catName ?? "",
    designation: o.designation ?? "",
    processingRecipe: o.processingRecipe || {},
    obsId: t.obsId,
    domeId: t.domeId,
    telescopeId: t.telescopeId,
    obsName: t.obsName,
    telescopeName: t.telescopeName,
    objectIconURL: o.objectIconURL || defaultObjectIcon(o.objectType),
    uniqueId: body.uniqueId || String(body.scheduledMissionId),
    targetName: o.targetName || o.objectTitle || "",
    objective: o.objective ?? "",
  };
}

export function handleMissionLimits(req, res, url, pathname) {
  (async () => {
    try {
      const cached = missionLimitsCache.get("limits");
      let limits;
      if (cached && Date.now() - cached.fetchedAt < MISSION_LIMITS_TTL) {
        limits = cached.data;
      } else {
        const d = await api("/api/reservation/getMissionLimits", {});
        limits = d.apiError ? null : mapMissionLimits(d);
        missionLimitsCache.set("limits", {
          data: limits,
          fetchedAt: Date.now(),
        });
      }
      json(res, 200, { timestamp: Date.now(), limits });
    } catch (e) {
      log("mission limits failed:", e.message);
      json(res, 502, { error: e.message });
    }
  })();
}

export function handleMissionDates(req, res, url, pathname) {
  const obsId = url.searchParams.get("obsId");
  const domeId = url.searchParams.get("domeId");
  const telescopeId = url.searchParams.get("telescopeId");
  const requestedDate =
    url.searchParams.get("requestedDate") || new Date().toISOString().slice(0, 10);
  const key = obsId + "/" + domeId + "/" + telescopeId + "/" + requestedDate;
  (async () => {
    try {
      if (!obsId || !domeId || !telescopeId) {
        json(res, 400, { error: "missing obsId/domeId/telescopeId" });
        return;
      }
      const cached = missionDatesCache.get(key);
      let dates;
      if (cached && Date.now() - cached.fetchedAt < MISSION_DATES_TTL) {
        dates = cached.data;
      } else {
        const d = await api("/api/reservation/getMissionSlotDates", {
          obsId,
          domeId,
          telescopeId,
          requestedDate,
        });
        dates = d.apiError
          ? []
          : (d.dateList || []).map((n) => ({
              reservationDate: n.reservationDate || null,
              reservationDateFormatted: n.reservationDateFormatted || null,
              firstMissionTimestamp: n.firstMissionTimestamp ?? null,
              lastMissionTimestamp: n.lastMissionTimestamp ?? null,
              backEnabled: n.backEnabled ?? false,
              backDate: n.backDate || null,
              forwardEnabled: n.forwardEnabled ?? false,
              forwardDate: n.forwardDate || null,
            }));
        missionDatesCache.set(key, { data: dates, fetchedAt: Date.now() });
      }
      json(res, 200, { timestamp: Date.now(), dates });
    } catch (e) {
      log("mission dates failed:", key, e.message);
      json(res, 502, { error: e.message });
    }
  })();
}

export function handleMissionSlots(req, res, url, pathname) {
  const obsId = url.searchParams.get("obsId");
  const telescopeId = url.searchParams.get("telescopeId");
  let domeId = url.searchParams.get("domeId");
  const reservationDate =
    url.searchParams.get("reservationDate") || new Date().toISOString().slice(0, 10);
  const key = obsId + "/" + (domeId || "0") + "/" + telescopeId + "/" + reservationDate;
  (async () => {
    try {
      if (!obsId || !telescopeId) {
        json(res, 400, { error: "missing obsId/telescopeId" });
        return;
      }
      if (!domeId) {
        const t = [...telescopeById.values()].find(
          (t) => t.obsId === obsId && t.telescopeId === telescopeId,
        );
        if (!t) {
          json(res, 404, { error: "telescope not found in catalog" });
          return;
        }
        domeId = String(t.domeId);
      }
      const cached = missionSlotsCache.get(key);
      let slots;
      if (cached && Date.now() - cached.fetchedAt < MISSION_SLOTS_TTL) {
        slots = cached.data;
      } else {
        const d = await api("/api/reservation/getMissionSlotsByTelescope", {
          obsId,
          telescopeId,
          domeId: domeId || 0,
          reservationDate,
        });
        slots = d.apiError
          ? null
          : {
              reservationDate: d.reservationDate || reservationDate,
              reservationDateFormatted: d.reservationDateFormatted || null,
              allowReservations: d.allowReservations ?? false,
              firstMissionTimestamp: d.firstMissionTimestamp ?? null,
              lastMissionTimestamp: d.lastMissionTimestamp ?? null,
              missionCount: d.missionCount ?? 0,
              slots: (d.missionList || []).map(mapSlotDetailed),
            };
        missionSlotsCache.set(key, { data: slots, fetchedAt: Date.now() });
      }
      json(res, 200, { timestamp: Date.now(), ...slots });
    } catch (e) {
      log("mission slots failed:", key, e.message);
      json(res, 502, { error: e.message });
    }
  })();
}

export function handleMissionSearch(req, res, url, pathname) {
  const q = (url.searchParams.get("q") || "").trim();
  (async () => {
    try {
      if (!q) {
        json(res, 400, { error: "missing search term (?q=...)" });
        return;
      }
      const d = await api("/api/search/findData", {
        findTerm: q,
        viewType: "all",
      });
      const raw = (d.findData || [])
        .filter((f) => f.itemType === "object")
        .slice(0, 12);
      const objects = await Promise.all(
        raw.map(async (f) => {
          const info = await getObjectInfo(f.astroObjectId);
          return {
            objectId: f.astroObjectId || f.id || null,
            objectTitle: info?.name || f.title || null,
            objectType: info?.type || f.itemType || null,
            objectRA: info?.ra ?? null,
            objectDec: info?.dec ?? null,
            objectConstellation: info?.constellation || null,
            objectIconURL: info?.iconURL || null,
            linkUrl: f.linkUrl || null,
          };
        }),
      );
      json(res, 200, {
        message: d.findMessage || null,
        objects: objects.filter((o) => o.objectId),
      });
    } catch (e) {
      log("mission search failed:", q, e.message);
      json(res, 502, { error: e.message });
    }
  })();
}

export function handleMissionReserve(req, res, url, pathname) {
  (async () => {
    try {
      let body = {};
      try {
        body = JSON.parse(await readBody(req));
      } catch (e) {
        json(res, 400, { error: "invalid request body" });
        return;
      }
      const t = resolveTelescope(body);
      if (!t) {
        json(res, 400, { error: "unknown telescope (teleUniqueId)" });
        return;
      }
      if (
        !body.scheduledMissionId ||
        !body.missionStart ||
        !body.object?.objectId
      ) {
        json(res, 400, {
          error: "missing scheduledMissionId/missionStart/object.objectId",
        });
        return;
      }
      const payload = reservePayload(t, body);
      log(
        "mission reserve:",
        JSON.stringify({ teleUniqueId: body.teleUniqueId, ...payload }).slice(0, 400),
      );
      const d = await api("/api/reservation/reserveMissionSlot", payload);
      const explanation = (d.missionList || [])[0]?.explanation || null;
      if (d.apiError || explanation) {
        json(res, 200, {
          error: d.errorMsg || explanation || "reservation rejected",
          detail: d,
        });
        return;
      }
      json(res, 200, { mission: d });
    } catch (e) {
      log("mission reserve failed:", e.message);
      json(res, 502, { error: e.message });
    }
  })();
}

export function handleMissionCancel(req, res, url, pathname) {
  (async () => {
    try {
      let body = {};
      try {
        body = JSON.parse(await readBody(req));
      } catch (e) {
        json(res, 400, { error: "invalid request body" });
        return;
      }
      const t = resolveTelescope(body);
      if (!t || !body.scheduledMissionId) {
        json(res, 400, { error: "unknown telescope or missing scheduledMissionId" });
        return;
      }
      const payload = reservePayload(t, body);
      delete payload.objectIconURL;
      delete payload.objective;
      payload.grabType = body.grabType || "notarget";
      log("mission cancel:", payload.scheduledMissionId);
      const d = await api("/api/reservation/cancelMissionSlot", payload);
      json(res, 200, { result: d });
    } catch (e) {
      log("mission cancel failed:", e.message);
      json(res, 502, { error: e.message });
    }
  })();
}