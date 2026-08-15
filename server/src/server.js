import { createServer } from "node:http";
import { PORT, CATALOG_REFRESH_MS, CORS, log } from "./config.js";
import { isAuthenticated } from "./auth.js";
import { serveStatic } from "./static.js";
import { json } from "./responses.js";
import { handleAuthStatus, handleLogin, handleLogout } from "./routes/auth.js";
import { handleTelescopes } from "./routes/catalog.js";
import { handleImage } from "./routes/image.js";
import { handleCaptures } from "./routes/captures.js";
import { handlePhotos } from "./routes/photos.js";
import { handleMissions } from "./routes/missions.js";
import { handleObject, handleObjectSummary } from "./routes/object.js";
import { handleWeather } from "./routes/weather.js";
import { handleEvents } from "./routes/events.js";
import { handleSseProxy } from "./routes/sseProxy.js";
import { refreshCatalog } from "./sloohClient.js";
import { subscribers } from "./state.js";

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname;
  try {
    return handle(req, res, url, pathname);
  } catch (e) {
    log("request error:", pathname, e.message);
    json(res, 500, { error: e.message });
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
  for (const res of subscribers) res.write(": ping\n\n");
}, 25_000);

server.listen(PORT, async () => {
  log("slooh proxy listening on http://localhost:" + PORT);
  await refreshCatalog();
  setInterval(refreshCatalog, CATALOG_REFRESH_MS);
});
