import { json, readBody } from "../responses.js";
import { log } from "../config.js";
import { api } from "../sloohClient.js";
import { getObjectInfo } from "../objects.js";
import {
  recommendCache,
  RECOMMEND_TTL,
  telescopeById,
} from "../state.js";

export function handleRecommend(req, res, url, pathname) {
  const objectId = url.searchParams.get("objectId");
  (async () => {
    try {
      if (!objectId) {
        json(res, 400, { error: "missing objectId" });
        return;
      }
      const cached = recommendCache.get(objectId);
      if (cached && Date.now() - cached.fetchedAt < RECOMMEND_TTL) {
        json(res, 200, cached.data);
        return;
      }
      let info = null;
      try {
        const o = await getObjectInfo(objectId);
        if (o && o.ra != null && o.dec != null) info = o;
      } catch (e) {
        log("recommend object info failed:", objectId, e.message);
      }
      if (!info) {
        json(res, 200, { object: null, slot: null, reason: "no coordinates" });
        return;
      }
      const objectList = [
        {
          objectId,
          objectTitle: info.name || null,
          objectType: info.type || null,
          objectRA: info.ra,
          objectDec: info.dec,
        },
      ];
      const d = await api("/api/recommends/getNextReservation", {
        requestType: "multiple",
        uniqueId: "",
        objectId: "",
        start: "",
        objectList,
      });
      const rows = (d.missionList || []).filter(
        (r) => String(r.objectId) === String(objectId) || d.missionCount === 1,
      );
      const row = rows[0] || null;
      const t =
        row && row.telescopeId && row.obsId
          ? [...telescopeById.values()].find(
              (tt) =>
                tt.telescopeId === row.telescopeId &&
                tt.obsId === row.obsId &&
                (row.domeId == null || Number(tt.domeId) === Number(row.domeId)),
            )
          : null;
      const slot =
        row && row.missionAvailable && row.scheduledMissionId
          ? {
              scheduledMissionId: row.scheduledMissionId,
              missionStart: row.missionStart ?? null,
              missionStartFormatted: row.missionStartFormatted || null,
              expires: row.expires ?? null,
              missionType: row.missionType || null,
              callSource: row.callSource || null,
              missionTitle: row.missionTitle || null,
              teleUniqueId: t?.teleUniqueId || row.teleUniqueId || null,
              obsId: t?.obsId || row.obsId || null,
              domeId: t?.domeId ?? row.domeId ?? null,
              telescopeId: t?.telescopeId || row.telescopeId || null,
              obsName: t?.obsName || null,
              telescopeName: t?.telescopeName || null,
              pierName: row.telescopePierName || null,
            }
          : null;
      const data = {
        object: {
          objectId,
          objectTitle: info.name || null,
          objectType: info.type || null,
          objectRA: info.ra,
          objectDec: info.dec,
          objectIconURL: info.iconURL || null,
        },
        slot,
      };
      recommendCache.set(objectId, { data, fetchedAt: Date.now() });
      json(res, 200, data);
    } catch (e) {
      log("recommend failed:", objectId, e.message);
      json(res, 502, { error: e.message });
    }
  })();
}

export function handleMissionJoin(req, res, url, pathname) {
  (async () => {
    try {
      let body = {};
      try {
        body = JSON.parse(await readBody(req));
      } catch (e) {
        json(res, 400, { error: "invalid request body" });
        return;
      }
      if (!body.scheduledMissionId) {
        json(res, 400, { error: "missing scheduledMissionId" });
        return;
      }
      const payload = {
        scheduledMissionId: body.scheduledMissionId,
        uniqueId: String(body.scheduledMissionId),
        callSource: body.callSource || "byTelescope",
        objectTitle: body.objectTitle || "",
        lookaheadPiggyback: body.lookaheadPiggyback ?? 0,
      };
      log("mission join:", payload.scheduledMissionId);
      const d = await api("/api/reservation/grabPiggyback", payload);
      const explanation =
        (d.missionList || [])[0]?.explanation ||
        d.explanation ||
        null;
      if (d.apiError || explanation) {
        json(res, 200, {
          error: d.errorMsg || explanation || "join rejected",
          detail: d,
        });
        return;
      }
      json(res, 200, { joined: true, mission: d });
    } catch (e) {
      log("mission join failed:", e.message);
      json(res, 502, { error: e.message });
    }
  })();
}