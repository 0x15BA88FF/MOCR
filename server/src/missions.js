import { api } from "./sloohClient.js";
import {
  currentMissionCache,
  CURRENT_MISSION_TTL,
  missionTitleCache,
  MISSION_TITLE_TTL,
  missionScheduleCache,
  MISSION_SCHEDULE_TTL,
  snappedIdCache,
  SNAPPED_ID_TTL,
} from "./state.js";
import { log } from "./config.js";

function mapCurrentMission(m) {
  if (!m || !m.missionAvailable) return null;
  return {
    scheduledMissionId: m.scheduledMissionId ?? null,
    title: m.objectTitle || null,
    missionStart: m.missionStart ?? null,
    durationSec: m.durationSec ?? null,
    expires: m.expires ?? null,
  };
}

function mapSlot(s) {
  return {
    scheduledMissionId: s.scheduledMissionId ?? null,
    title: s.slotTitle || null,
    missionStart: s.missionStart ?? null,
    durationSec: s.durationSec ?? null,
    missionType: s.missionType || null,
    slotStatus: s.slotStatus || null,
  };
}

async function findSnappedImageId(imageId) {
  const hit = snappedIdCache.get(imageId);
  if (hit && Date.now() - hit.fetchedAt < SNAPPED_ID_TTL) return hit.id;
  try {
    const d = await api("/api/images/getMyPictures", {
      pagingMode: "api",
      maxImageCount: 24,
      firstImageNumber: 1,
      viewType: "photoRoll",
    });
    const found = (d.imageList || []).find(
      (img) => String(img.imageId) === String(imageId),
    );
    const id = found?.customerImageId ?? null;
    if (id != null) snappedIdCache.set(imageId, { id, fetchedAt: Date.now() });
    return id;
  } catch (e) {
    log("find snapped image failed:", e.message);
    return null;
  }
}

async function getCurrentMissionInfo(t) {
  const key = t.obsId + "/" + t.telescopeId + "/" + t.domeId;
  const cached = currentMissionCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CURRENT_MISSION_TTL)
    return cached.data;
  try {
    const d = await api("/api/reservation/getCurrentMission", {
      obsId: t.obsId,
      telescopeId: t.telescopeId,
      domeId: t.domeId,
      format: "compact",
    });
    const current = d.apiError
      ? null
      : mapCurrentMission((d.missionList || [])[0]);
    currentMissionCache.set(key, { data: current, fetchedAt: Date.now() });
    if (current?.scheduledMissionId != null && current.title) {
      missionTitleCache.set(String(current.scheduledMissionId), {
        title: current.title,
        fetchedAt: Date.now(),
      });
    }
    return current;
  } catch (e) {
    log("current mission failed:", key, e.message);
    return null;
  }
}

function getMissionTitleSync(t, scheduledMissionId) {
  if (!scheduledMissionId || scheduledMissionId === "0") return null;
  const id = String(scheduledMissionId);
  const hit = missionTitleCache.get(id);
  if (hit && Date.now() - hit.fetchedAt < MISSION_TITLE_TTL) return hit.title;
  const current = currentMissionCache.get(
    t.obsId + "/" + t.telescopeId + "/" + t.domeId,
  )?.data;
  if (current && String(current.scheduledMissionId) === id)
    return current.title;
  return null;
}

async function ensureMissionTitle(t, scheduledMissionId) {
  try {
    if (!scheduledMissionId || scheduledMissionId === "0") return;
    if (getMissionTitleSync(t, scheduledMissionId)) return;
    await getCurrentMissionInfo(t);
  } catch (e) {
    log("mission title failed:", e.message);
  }
}

export {
  mapCurrentMission,
  mapSlot,
  getCurrentMissionInfo,
  getMissionTitleSync,
  ensureMissionTitle,
  findSnappedImageId,
};
