import { api } from "./sloohClient.js";
import { sendPush, pushSubscriptionCount, initPush } from "./push.js";
import { alertsCache, ALERTS_TTL } from "./state.js";
import { log } from "./config.js";

const seen = new Map();
const SEEN_TTL = 24 * 60 * 60 * 1000;
const WATCH_INTERVAL_MS = 60_000;

function pruneSeen() {
  const cutoff = Date.now() - SEEN_TTL;
  for (const [id, ts] of seen) if (ts < cutoff) seen.delete(id);
}

function alertLinkUrl(linkUrl) {
  if (!linkUrl) return "/telescope";
  const m = String(linkUrl).match(/\/show-image\/(\d+)/);
  return m ? "/telescope?photo=" + m[1] : "/telescope";
}

export async function watchForAlerts() {
  if (pushSubscriptionCount() === 0) return;
  pruneSeen();
  let data = null;
  const cached = alertsCache.get("alerts");
  if (cached && Date.now() - cached.fetchedAt < ALERTS_TTL) {
    data = cached.data;
  } else {
    try {
      const d = await api("/api/notify/getAlertsInformation", {});
      if (!d.apiError) data = { alerts: (d.alertList || []).map(mapRaw) };
    } catch (e) {
      log("alert watcher fetch failed:", e.message);
    }
  }
  if (!data) return;
  let sent = 0;
  for (const a of data.alerts) {
    if (!a.isNewEvent || !a.eventId) continue;
    const key = String(a.eventId);
    if (seen.has(key)) continue;
    seen.set(key, Date.now());
    if (sent >= 3) continue;
    const result = await sendPush(
      "MOCR · Slooh alert",
      `${a.eventLabel || "New alert"}${
        a.eventTitle && a.eventTitle !== a.eventLabel
          ? ` — ${a.eventTitle}`
          : ""
      }`,
      alertLinkUrl(a.linkUrl),
    );
    if (result.sent > 0) sent++;
  }
}

function mapRaw(a) {
  return {
    eventId: a.eventId,
    isNewEvent: a.isNewEvent,
    eventLabel: a.eventLabel,
    eventTitle: a.eventTitle,
    linkUrl: a.linkUrl,
  };
}

export function startAlertWatcher() {
  initPush();
  watchForAlerts().catch((e) =>
    log("alert watcher failed:", e.message),
  );
  const timer = setInterval(() => {
    watchForAlerts().catch((e) => log("alert watcher failed:", e.message));
  }, WATCH_INTERVAL_MS);
  timer.unref?.();
  log("alert push watcher started");
}