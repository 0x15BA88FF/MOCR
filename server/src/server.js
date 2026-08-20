import { createServer } from "node:http";
import { PORT, CATALOG_REFRESH_MS, CORS, DEBUG, log } from "./config.js";
import { isAuthenticated } from "./auth.js";
import { serveStatic } from "./static.js";
import { json } from "./responses.js";
import { handleAuthStatus, handleLogin, handleLogout } from "./routes/auth.js";
import { handleTelescopes } from "./routes/catalog.js";
import { handleImage } from "./routes/image.js";
import { handleCaptures } from "./routes/captures.js";
import { handlePhotos } from "./routes/photos.js";
import { handleMissions } from "./routes/missions.js";
import {
  handleMissionLimits,
  handleMissionDates,
  handleMissionSlots,
  handleMissionSearch,
  handleMissionReserve,
  handleMissionCancel,
} from "./routes/reservation.js";
import { handleObject, handleObjectSummary } from "./routes/object.js";
import { handleWeather } from "./routes/weather.js";
import {
  handleSlooh1000Categories,
  handleSlooh1000Objects,
  handleSlooh1000SlotPreview,
} from "./routes/slooh1000.js";
import { handleEvents } from "./routes/events.js";
import { handleSseProxy } from "./routes/sseProxy.js";
import { handleAlerts, handleAlertRead } from "./routes/alerts.js";
import { handleSky } from "./routes/sky.js";
import { handleEventsList, handleLivecast } from "./routes/livecast.js";
import { handleRecommend, handleMissionJoin } from "./routes/recommends.js";
import {
  handlePushConfigure,
  handlePushSubscribe,
  handlePushUnsubscribe,
  handlePushTest,
  handlePushSend,
} from "./routes/push.js";
import { startAlertWatcher } from "./pushWatcher.js";
import { refreshCatalog } from "./sloohClient.js";
import { subscribers } from "./state.js";

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname;
  const startedAt = Date.now();
  try {
    return handle(req, res, url, pathname);
  } catch (e) {
    log("request error:", pathname, e.message);
    json(res, 500, { error: e.message });
  } finally {
    if (DEBUG)
      log("req:", req.method, pathname, Date.now() - startedAt + "ms");
  }
});

function handle(req, res, url, pathname) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (pathname === "/api/auth/status") {
    handleAuthStatus(req, res, url);
    return;
  }
  if (pathname === "/api/auth/login" && req.method === "POST") {
    handleLogin(req, res, url);
    return;
  }
  if (pathname === "/api/auth/logout" && req.method === "POST") {
    handleLogout(req, res);
    return;
  }

  if (
    (pathname.startsWith("/api/") || pathname.startsWith("/sse/")) &&
    !isAuthenticated(req, url)
  ) {
    json(res, 401, { error: "Unauthorized" });
    return;
  }

  if (
    pathname === "/" ||
    pathname === "/index.html" ||
    !pathname.startsWith("/api/")
  ) {
    serveStatic(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/telescopes") {
    handleTelescopes(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/image") {
    handleImage(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/captures" && req.method === "POST") {
    handleCaptures(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/photos") {
    handlePhotos(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/missions") {
    handleMissions(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/mission-limits") {
    handleMissionLimits(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/mission-dates") {
    handleMissionDates(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/mission-slots") {
    handleMissionSlots(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/mission-search") {
    handleMissionSearch(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/mission/slot-preview") {
    handleSlooh1000SlotPreview(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/slooh1000/categories") {
    handleSlooh1000Categories(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/slooh1000/objects") {
    handleSlooh1000Objects(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/mission/reserve" && req.method === "POST") {
    handleMissionReserve(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/mission/cancel" && req.method === "POST") {
    handleMissionCancel(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/mission/join" && req.method === "POST") {
    handleMissionJoin(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/alerts") {
    handleAlerts(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/alerts/read" && req.method === "POST") {
    handleAlertRead(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/sky") {
    handleSky(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/events/upcoming") {
    handleEventsList(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/livecast") {
    handleLivecast(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/recommend") {
    handleRecommend(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/push/configure") {
    handlePushConfigure(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/push/subscribe" && req.method === "POST") {
    handlePushSubscribe(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/push/unsubscribe" && req.method === "POST") {
    handlePushUnsubscribe(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/push/test" && req.method === "POST") {
    handlePushTest(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/push/send" && req.method === "POST") {
    handlePushSend(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/object") {
    handleObject(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/object-summary") {
    handleObjectSummary(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/weather") {
    handleWeather(req, res, url, pathname);
    return;
  }
  if (pathname === "/api/events") {
    handleEvents(req, res, url, pathname);
    return;
  }
  if (pathname.startsWith("/sse/")) {
    handleSseProxy(req, res, url, pathname);
    return;
  }
  json(res, 404, { error: "not found" });
}

setInterval(() => {
  for (const res of subscribers) {
    try {
      res.write(": ping\n\n");
    } catch {
      subscribers.delete(res);
    }
  }
}, 25_000);

process.on("uncaughtException", (e) => log("uncaught exception:", e.message));
process.on("unhandledRejection", (e) => log("unhandled rejection:", e.message));

server.listen(PORT, async () => {
  log("slooh proxy listening on http://localhost:" + PORT);
  await refreshCatalog();
  setInterval(refreshCatalog, CATALOG_REFRESH_MS);
  startAlertWatcher();
});
