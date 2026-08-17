import { json } from "../responses.js";
import { log } from "../config.js";
import { api, get } from "../sloohClient.js";
import { eventsCache, EVENTS_TTL, livecastCache, LIVECAST_TTL } from "../state.js";

function mapEvent(e) {
  return {
    eventId: e.eventId ?? null,
    title: e.eventTitle || null,
    dateText: e.eventDateText || null,
    eventDate: e.eventDate || null,
    timeText: e.timeZoneLabel || null,
    description: e.eventDescription || e.eventShortDescription || null,
    hasLivecast: e.showLivecastButton ?? false,
    linkUrl: e.eventLink || e.linkUrl || null,
    isFree: e.freeEventFlag ?? false,
    productId: e.productId ?? null,
    eventType: e.eventType || e.eventTypeText || null,
  };
}

export function handleEventsList(req, res, url, pathname) {
  (async () => {
    try {
      const cached = eventsCache.get("upcoming");
      let data;
      if (cached && Date.now() - cached.fetchedAt < EVENTS_TTL) {
        data = cached.data;
      } else {
        const d = await get("/api/events/upcoming", {
          limit: url.searchParams.get("limit") || "20",
          productId: url.searchParams.get("productId") || "",
        });
        data = d.apiError
          ? null
          : {
              eventCount: d.eventCount ?? 0,
              resultsCount: d.resultsCount ?? 0,
              pages: d.pages ?? 0,
              events: (d.eventList || []).map(mapEvent),
            };
        eventsCache.set("upcoming", { data, fetchedAt: Date.now() });
      }
      json(res, 200, { timestamp: Date.now(), ...data });
    } catch (e) {
      log("events list failed:", e.message);
      json(res, 502, { error: e.message });
    }
  })();
}

export function handleLivecast(req, res, url, pathname) {
  (async () => {
    try {
      const cached = livecastCache.get("livecast");
      let data;
      if (cached && Date.now() - cached.fetchedAt < LIVECAST_TTL) {
        data = cached.data;
      } else {
        const d = await api("/api/events/getLivecast", {});
        data = d.apiError
          ? null
          : {
              isLive: d.isLive ?? false,
              displayTitle: d.displayTitle || null,
              refreshIntervalSec: d.refreshInterval ?? null,
              upcomingShows: (d.UpcomingShowData || []).map((s) => ({
                title: s.showTitle || null,
                dateText: s.showDateText || null,
                linkUrl: s.showLinkURL || null,
              })),
            };
        livecastCache.set("livecast", { data, fetchedAt: Date.now() });
      }
      json(res, 200, { timestamp: Date.now(), ...data });
    } catch (e) {
      log("livecast failed:", e.message);
      json(res, 502, { error: e.message });
    }
  })();
}