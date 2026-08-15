export const sessions = new Map();

export let catalog = [];
export let telescopeById = new Map();
export let catalogTimestamp = 0;

export const latest = new Map();
export const subscribers = new Set();
export const activeFeeds = new Set();

export const objectCache = new Map();
export const OBJECT_CACHE_TTL = 60 * 60 * 1000;

export const currentMissionCache = new Map();
export const CURRENT_MISSION_TTL = 45 * 1000;

export const missionTitleCache = new Map();
export const MISSION_TITLE_TTL = 45 * 1000;

export const missionScheduleCache = new Map();
export const MISSION_SCHEDULE_TTL = 10 * 60 * 1000;

export const snappedIdCache = new Map();
export const SNAPPED_ID_TTL = 10 * 60 * 1000;

export function setCatalog(list) {
  catalog = list;
}
export function setCatalogTimestamp(t) {
  catalogTimestamp = t;
}
export function setTelescopeById(m) {
  telescopeById = m;
}
