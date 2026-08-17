import { json } from "../responses.js";
import { log } from "../config.js";
import { api } from "../sloohClient.js";
import { telescopeById, skyCache, SKY_TTL } from "../state.js";

const WIDGET_FIELDS = [
  ["seeing", "seeingConditions", "SeeingConditionsWidgetId", (d) => ({
    index: d.seeingConditionsIndex ?? null,
    description: d.seeingConditionsDescription ?? null,
    color: d.seeingConditionsColor ?? null,
    subtitle: d.subtitle || null,
  })],
  ["allSkyCamera", "allSkyCamera", "AllskyWidgetId", (d) => ({
    title: d.title || null,
    url: d.allSkyCamURL || null,
  })],
  ["domeCamera", "domeCamera", "DomecamWidgetId", (d) => ({
    title: d.title || null,
    url: d.domeCamURL || null,
  })],
  ["facilityWebcam", "facilityWebcam", "FacilityWebcamWidgetId", (d) => ({
    title: d.title || null,
    credits: d.credits || null,
    url: d.facilityWebcamURL || null,
  })],
  ["dayNightBar", "dayNightBar", "DayNightBarWidgetId", (d) => ({
    url: d.dayNightBarURL || null,
    raw: d.dayNightRawData || null,
  })],
  ["dayNightMap", "dayNightMap", "DayNightMapWidgetId", (d) => ({
    url: d.dayNightMapURL || null,
  })],
  ["missionControl", "missionControlStatus", "MissionControlStatusWidgetId", (d) => ({
    title: d.title || null,
    content: d.content || null,
    url: d.missionControlStatusURL || null,
  })],
];

function stripHtml(text) {
  if (!text) return null;
  return String(text)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&deg;/gi, "°")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function handleSky(req, res, url, pathname) {
  const obsId = url.searchParams.get("obsId");
  (async () => {
    try {
      if (!obsId) {
        json(res, 400, { error: "missing obsId" });
        return;
      }
      const cached = skyCache.get(obsId);
      if (cached && Date.now() - cached.fetchedAt < SKY_TTL) {
        json(res, 200, cached.data);
        return;
      }
      const telescope = [...telescopeById.values()].find(
        (t) => t.obsId === obsId,
      );
      if (!telescope) {
        json(res, 404, { error: "observatory not found in catalog" });
        return;
      }
      const t0 = Date.now();
      const catalog = await api("/api/obs/list", {
        callSource: "details",
        lang: "en",
        status: "live",
        listType: "full",
      });
      log("sky obs list:", obsId, Date.now() - t0 + "ms");
      const obs = (catalog.observatoryList || []).find(
        (o) => o.obsId === obsId,
      );
      const widgets = {};
      await Promise.all(
        WIDGET_FIELDS.map(async ([key, slug, idField, map]) => {
          const id = obs?.[idField];
          if (!id) {
            widgets[key] = null;
            return;
          }
          try {
            const t0 = Date.now();
            const d = await api("/api/widget/" + slug, {
              obsId,
              widgetUniqueId: id,
            });
            const online = d.onlineStatus !== "offline";
            log(
              "sky widget:",
              obsId,
              slug,
              online ? "ok" : "offline",
              Date.now() - t0 + "ms",
            );
            widgets[key] = {
              observedAt: d.timestamp ? d.timestamp * 1000 : null,
              online,
              refreshIntervalSec: d.refreshIntervalSec ?? null,
              ...(map(d) || {}),
            };
          } catch (e) {
            log("sky widget failed:", obsId, slug, e.message);
            widgets[key] = null;
          }
        }),
      );
      if (widgets.missionControl) {
        widgets.missionControl.contentText = stripHtml(
          widgets.missionControl.content,
        );
      }
      const data = {
        timestamp: Date.now(),
        obsId,
        obsName: obs?.obsName || telescope.obsName,
        widgets,
      };
      skyCache.set(obsId, { data, fetchedAt: Date.now() });
      json(res, 200, data);
    } catch (e) {
      log("sky failed:", obsId, e.message);
      json(res, 502, { error: e.message });
    }
  })();
}