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

export const missionLimitsCache = new Map();
export const MISSION_LIMITS_TTL = 30 * 1000;

export const missionDatesCache = new Map();
export const MISSION_DATES_TTL = 10 * 60 * 1000;

export const missionSlotsCache = new Map();
export const MISSION_SLOTS_TTL = 90 * 1000;

export const slooh1000CategoriesCache = new Map();
export const SLOOH1000_CATEGORIES_TTL = 10 * 60 * 1000;

export const slooh1000ObjectsCache = new Map();
export const SLOOH1000_OBJECTS_TTL = 90 * 1000;


export const alertsCache = new Map();
export const ALERTS_TTL = 60 * 1000;

export const skyCache = new Map();
export const SKY_TTL = 120 * 1000;

export const eventsCache = new Map();
export const EVENTS_TTL = 5 * 60 * 1000;

export const livecastCache = new Map();
export const LIVECAST_TTL = 60 * 1000;


export const recommendCache = new Map();
export const RECOMMEND_TTL = 5 * 60 * 1000;

export function setCatalog(list) {
  catalog = list;
}
export function setCatalogTimestamp(t) {
  catalogTimestamp = t;
}
export function setTelescopeById(m) {
  telescopeById = m;
}
