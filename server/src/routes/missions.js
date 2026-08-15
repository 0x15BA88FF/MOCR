import { json } from "../responses.js";
import { log } from "../config.js";
import { telescopeById, missionScheduleCache, MISSION_SCHEDULE_TTL } from "../state.js";
import { getCurrentMissionInfo, mapSlot } from "../missions.js";
import { api } from "../sloohClient.js";

export function handleMissions(req, res, url, pathname) {
  const uids = (url.searchParams.get("uids") || "")
    .split(",")
    .filter(Boolean);
  (async () => {
    try {
      const missions = await Promise.all(
        uids.map(async (uid) => {
          const t = telescopeById.get(uid);
          if (!t || !t.obsId || !t.telescopeId || !t.domeId) {
            return {
              teleUniqueId: uid,
              current: null,
              next: null,
              upcoming: [],
            };
          }
          const key = t.obsId + "/" + t.telescopeId + "/" + t.domeId;
          const nowSec = Math.floor(Date.now() / 1000);
          const today = new Date().toISOString().slice(0, 10);
          const schedKey = key + "/" + today;
          const base = {
            teleUniqueId: uid,
            current: null,
            next: null,
            upcoming: [],
          };

          try {
            base.current = await getCurrentMissionInfo(t);
          } catch (e) {
            log("current mission failed:", key, e.message);
          }

          try {
            const schedCached = missionScheduleCache.get(schedKey);
            let schedule = schedCached?.data;
            if (
              !schedCached ||
              Date.now() - schedCached.fetchedAt > MISSION_SCHEDULE_TTL
            ) {
              const d = await api(
                "/api/reservation/getMissionSlotsByTelescope",
                {
                  obsId: t.obsId,
                  telescopeId: t.telescopeId,
                  domeId: t.domeId,
                  reservationDate: today,
                },
              );
              schedule = d.apiError ? [] : (d.missionList || []).map(mapSlot);
              missionScheduleCache.set(schedKey, {
                data: schedule,
                fetchedAt: Date.now(),
              });
            }
            const upcoming = schedule
              .filter((m) => m.missionStart >= nowSec - 30)
              .sort((a, b) => a.missionStart - b.missionStart)
              .slice(0, 6);
            base.upcoming = upcoming;
            base.next =
              upcoming.find((m) => m.missionStart >= nowSec - 30) || null;
          } catch (e) {
            log("mission schedule failed:", schedKey, e.message);
          }
          return base;
        }),
      );
      json(res, 200, { timestamp: Date.now(), missions });
    } catch (e) {
      json(res, 502, { error: e.message });
    }
  })();
}
