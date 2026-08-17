import { json, readBody } from "../responses.js";
import { log } from "../config.js";
import { api } from "../sloohClient.js";
import { alertsCache, ALERTS_TTL } from "../state.js";

function mapAlert(a) {
  return {
    eventId: a.eventId ?? null,
    isNewEvent: a.isNewEvent ?? false,
    active: a.active ?? false,
    eventLabel: a.eventLabel || null,
    eventTitle: a.eventTitle || null,
    imageAuthor: a.imageAuthor || null,
    hasLink: a.hasLink ?? false,
    linkLabel: a.linkLabel || null,
    linkUrl: a.linkUrl || null,
    canDismiss: a.canDismiss ?? false,
    eventSubtitle: a.eventSubtitle ?? false,
  };
}

export function handleAlerts(req, res, url, pathname) {
  (async () => {
    try {
      const cached = alertsCache.get("alerts");
      let data;
      if (cached && Date.now() - cached.fetchedAt < ALERTS_TTL) {
        data = cached.data;
      } else {
        const d = await api("/api/notify/getAlertsInformation", {});
        data = d.apiError
          ? null
          : {
              notificationsCount: d.notificationsCount ?? 0,
              alertCount: d.alertCount ?? 0,
              alerts: (d.alertList || []).map(mapAlert),
            };
        alertsCache.set("alerts", { data, fetchedAt: Date.now() });
      }
      json(res, 200, { timestamp: Date.now(), ...data });
    } catch (e) {
      log("alerts failed:", e.message);
      json(res, 502, { error: e.message });
    }
  })();
}

export function handleAlertRead(req, res, url, pathname) {
  (async () => {
    try {
      let body = {};
      try {
        body = JSON.parse(await readBody(req));
      } catch (e) {
        json(res, 400, { error: "invalid request body" });
        return;
      }
      if (!body.eventId) {
        json(res, 400, { error: "missing eventId" });
        return;
      }
      const d = await api("/api/notify/markAsRead", {
        eventId: body.eventId,
        ...(body.interestId ? { interestId: body.interestId } : {}),
      });
      json(res, 200, { result: d });
    } catch (e) {
      log("alert read failed:", e.message);
      json(res, 502, { error: e.message });
    }
  })();
}