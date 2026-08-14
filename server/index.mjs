import { createServer } from "node:http";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Body, Equator, Horizon, MakeTime, Observer } from "astronomy-engine";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const APP = "https://app.slooh.com";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const SESSION_FILE = path.join(ROOT, ".slooh-session.json");
const CATALOG_REFRESH_MS = 60_000;
const RECONNECT_MS = 5_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Last-Event-ID",
};

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || m[1] in process.env) continue;
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}
loadEnv();

const PORT = Number(process.env.SLOOH_PROXY_PORT || 8270);

// --- slooh session ---------------------------------------------------------

async function sloohPost(apiPath, body) {
  const res = await fetch(APP + apiPath, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify(body),
  });
  return res.json();
}

function loadSession() {
  try {
    const s = JSON.parse(readFileSync(SESSION_FILE, "utf8"));
    if (s.cid && s.at && s.token) return s;
  } catch {}
  return null;
}

function saveSession(s) {
  try {
    writeFileSync(SESSION_FILE, JSON.stringify(s, null, 2), { mode: 0o600 });
  } catch (e) {
    log("could not cache session:", e.message);
  }
}

function dropSession() {
  try {
    rmSync(SESSION_FILE, { force: true });
  } catch {}
}

async function login() {
  const cached = loadSession();
  if (cached) return cached;
  const email = process.env.SLOOH_EMAIL;
  const passwd = process.env.SLOOH_PASSWD;
  if (!email || !passwd)
    throw new Error(
      "missing SLOOH_EMAIL / SLOOH_PASSWD (see server/.env.example)",
    );
  const d = await sloohPost("/api/users/login", {
    username: email.toLowerCase(),
    passwd,
    requestedPage: null,
    customerUUID: null,
    impToken: null,
    lmsLogin: false,
    lmsOauthToken: null,
    lmsType: null,
  });
  if (d.apiError || !d.token)
    throw new Error("login failed: " + JSON.stringify(d.errorMsg || d));
  const session = { cid: d.cid, at: d.at, token: d.token };
  saveSession(session);
  return session;
}

let session = null;
let sessionLock = null;

async function getSession() {
  if (session) return session;
  if (!sessionLock) sessionLock = login().finally(() => (sessionLock = null));
  return sessionLock;
}

async function api(apiPath, extra = {}) {
  const s = await getSession();
  const d = await sloohPost(apiPath, {
    at: s.at,
    cid: s.cid,
    token: s.token,
    ...extra,
  });
  if (!d.apiError) return d;
  if (d.statusCode === 401 || d.statusCode === 402 || d.statusCode === 403) {
    log("session expired, re-logging in");
    dropSession();
    session = null;
    const fresh = await getSession();
    const retry = await sloohPost(apiPath, {
      at: fresh.at,
      cid: fresh.cid,
      token: fresh.token,
      ...extra,
    });
    if (retry.apiError)
      throw new Error(
        apiPath + " apiError: " + JSON.stringify(retry.errorMsg || retry),
      );
    return retry;
  }
  throw new Error(apiPath + " apiError: " + JSON.stringify(d.errorMsg || d));
}

async function get(apiPath, params = {}) {
  const s = await getSession();
  const qs = new URLSearchParams({
    token: s.token,
    at: s.at,
    cid: s.cid,
    ...params,
  });
  const res = await fetch(APP + apiPath + "?" + qs, {
    headers: { "User-Agent": UA },
  });
  const d = await res.json().catch(() => ({}));
  if (d.apiError)
    throw new Error(apiPath + " apiError: " + JSON.stringify(d.errorMsg || d));
  return d;
}

// --- catalog ----------------------------------------------------------------

function parseDms(text) {
  if (!text) return null;
  const m = String(text).match(
    /(\d+)\s*°\s*(\d+)\s*'\s*([\d.]+)?"?\s*([NSEW])/i,
  );
  if (!m) return null;
  let v = Number(m[1]) + Number(m[2]) / 60 + Number(m[3] || 0) / 3600;
  if (/[SW]/i.test(m[4])) v = -v;
  return v;
}

function parseElevationMeters(text) {
  if (!text) return 0;
  const m = String(text).match(/([\d,]+)\s*M/i);
  return m ? Number(m[1].replace(/,/g, "")) || 0 : 0;
}

async function fetchCatalog() {
  const d = await api("/api/obs/list", {
    callSource: "details",
    lang: "en",
    status: "live",
    listType: "full",
  });
  return (d.observatoryList || []).flatMap((obs) =>
    (obs.obsTelescopes || []).map((t) => {
      const inst = (t.teleInstrumentList || [])[0] || {};
      const imageSourceType = (
        t.teleImageSourceType ||
        inst.instrImageSourceType ||
        ""
      ).toLowerCase();
      const system = t.teleSystem || inst.instrSystem || null;
      const streamCode = t.teleStreamCode || inst.instrStreamCode || null;
      const streamURL = t.teleStreamURL || inst.instrStreamURL || null;
      const teleUniqueId = t.teleUniqueId || obs.obsId + ":" + t.teleId;
      return {
        obsId: obs.obsId,
        obsName: obs.obsName,
        latitude: parseDms(obs.obsLatitudeText),
        longitude: parseDms(obs.obsLongitudeText),
        elevationM: parseElevationMeters(obs.obsAltitude),
        telescopeId: t.teleId,
        teleUniqueId,
        telescopeName: t.teleName,
        online: t.teleOnlineStatus !== "offline",
        status: t.teleOnlineStatus,
        imageSourceType,
        feedType:
          imageSourceType === "video" &&
          (streamCode || youtubeVideoId(streamURL))
            ? "video"
            : system
              ? "sse"
              : null,
        system,
        streamCode,
        streamURL,
        about: t.teleTelescopeUsage || null,
        instrumentId: inst.instrUniqueId || null,
        domeId: Number(inst.instrDomeId ?? inst.instrPierNumber ?? 0),
        missionCount: t.teleContentCount || 0,
      };
    }),
  );
}

function youtubeVideoId(urlOrId) {
  if (!urlOrId) return null;
  const s = String(urlOrId).trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/,
  );
  return m ? m[1] : null;
}

function feedUrl(t) {
  if (t.feedType === "video") {
    const id = youtubeVideoId(t.streamURL) || t.streamCode;
    return (
      "https://www.youtube.com/embed/" +
      id +
      "?rel=0&autoplay=1&modestbranding=1&controls=0&showinfo=0&vq=hd720&origin=http://localhost:5173/"
    );
  }
  return APP + "/sse/" + t.system;
}

// --- slooh sse feed ----------------------------------------------------------

async function* sloohFeed(system, signal) {
  const url = APP + "/sse/" + system;
  log("subscribe", url);
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/event-stream" },
    signal,
  });
  if (!res.ok || !res.body) throw new Error("SSE HTTP " + res.status);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let lastId = null;
  let data = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of block.split("\n")) {
        if (line.startsWith("id:")) lastId = line.slice(3).trim();
        else if (line.startsWith("data:")) data = line.slice(5).trim();
      }
      if (data) {
        let frame = null;
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.messageType !== "HEARTBEAT") frame = parsed;
        } catch {}
        data = "";
        if (frame) yield { frame, id: lastId };
      }
    }
  }
}

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

const snappedIdCache = new Map(); // imageId -> customerImageId
const SNAPPED_ID_TTL = 10 * 60 * 1000;

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

// --- feed manager -------------------------------------------------------------

const latest = new Map(); // teleUniqueId -> latest frame
const subscribers = new Set(); // browser SSE responses
const activeFeeds = new Set(); // systems currently connected
const objectCache = new Map(); // astroObjectID -> { data, fetchedAt }
const OBJECT_CACHE_TTL = 60 * 60 * 1000;
const currentMissionCache = new Map(); // obsId/telescopeId/domeId -> { data, fetchedAt }
const CURRENT_MISSION_TTL = 45 * 1000;
const missionTitleCache = new Map(); // scheduledMissionId -> { title, fetchedAt }
const MISSION_TITLE_TTL = 45 * 1000;
const missionScheduleCache = new Map(); // obsId/telescopeId/date -> { data, fetchedAt }
const MISSION_SCHEDULE_TTL = 10 * 60 * 1000;
let telescopeById = new Map();
let catalog = [];
let catalogTimestamp = 0;

async function getObjectInfo(objectId) {
  if (!objectId || objectId === "0") return null;
  const hit = objectCache.get(objectId);
  if (hit && Date.now() - hit.fetchedAt < OBJECT_CACHE_TTL) return hit.data;
  try {
    const d = await api("/api/object/getObjectData", {
      objectId,
      callSource: "details",
    });
    const info = {
      name: d.objectTitle || null,
      description: d.objectDescription || null,
      audioURL: d.objectAudioURL || null,
      type: d.objectType || null,
      constellation: d.objectConstellation || null,
      ra: typeof d.objectRA === "number" ? d.objectRA : null,
      dec: typeof d.objectDeclination === "number" ? d.objectDeclination : null,
      sizeArcSeconds: Number(d.objectSizeArcSeconds) || null,
      magnitude: d.objectMagnitudeDisplay || d.objectMagnitude || null,
      distance: d.objectDistance || null,
      coordinatesDisplay: cleanHtml(d.objectCoordinatesDisplay),
    };
    objectCache.set(objectId, { data: info, fetchedAt: Date.now() });
    return info;
  } catch (e) {
    log("object info failed:", objectId, e.message);
    return null;
  }
}

function cleanHtml(text) {
  if (!text) return null;
  return String(text)
    .replace(/<br\s*\/?>/gi, " · ")
    .replace(/&deg;/gi, "°")
    .replace(/&prime;/gi, "′")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/<[^>]+>/g, "")
    .trim();
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

function computePointing(t, frame, object) {
  if (t.latitude == null || t.longitude == null) return null;
  const unixSec = Number(frame?.serverTime) || Math.floor(Date.now() / 1000);
  try {
    const time = MakeTime(new Date(unixSec * 1000));
    const observer = new Observer(t.latitude, t.longitude, t.elevationM || 0);
    let ra = object?.ra ?? null;
    let dec = object?.dec ?? null;
    let fromEphemeris = false;
    if (object?.type === "sun") {
      const eq = Equator(Body.Sun, time, observer, true, true);
      ra = eq.ra;
      dec = eq.dec;
      fromEphemeris = true;
    } else if (object?.type === "moon") {
      const eq = Equator(Body.Moon, time, observer, true, true);
      ra = eq.ra;
      dec = eq.dec;
      fromEphemeris = true;
    }
    if (ra == null || dec == null) return null;
    const hor = Horizon(time, observer, ra, dec, "normal");
    return {
      ra,
      dec,
      fromEphemeris,
      altAz: {
        altitude: Math.round(hor.altitude * 10) / 10,
        azimuth: Math.round(hor.azimuth * 10) / 10,
      },
    };
  } catch (e) {
    log("alt/az failed:", t.teleUniqueId, e.message);
    return null;
  }
}

function broadcast(payload) {
  const text = "data: " + JSON.stringify(payload) + "\n\n";
  for (const res of subscribers) res.write(text);
}

function ensureFeed(t) {
  if (activeFeeds.has(t.system)) return;
  activeFeeds.add(t.system);
  const ac = new AbortController();
  const run = async () => {
    try {
      for await (const { frame, id } of sloohFeed(t.system, ac.signal)) {
        latest.set(t.teleUniqueId, frame);
        if (frame.astroObjectID && !objectCache.has(frame.astroObjectID)) {
          getObjectInfo(frame.astroObjectID);
        }
        ensureMissionTitle(t, frame.scheduledMissionID);
        broadcast({
          type: "frame",
          telescopeId: t.telescopeId,
          teleUniqueId: t.teleUniqueId,
          frame,
          missionTitle: getMissionTitleSync(t, frame.scheduledMissionID),
        });
      }
      log("feed ended:", t.system);
    } catch (e) {
      if (e.name === "AbortError") return;
      log("feed error:", t.system, e.message);
    } finally {
      activeFeeds.delete(t.system);
      const current = telescopeById.get(t.teleUniqueId);
      if (current && current.online && current.system) {
        setTimeout(() => ensureFeed(current), RECONNECT_MS);
      }
    }
  };
  run();
}

async function refreshCatalog() {
  try {
    const list = await fetchCatalog();
    catalog = list;
    catalogTimestamp = Date.now();
    telescopeById = new Map(list.map((t) => [t.teleUniqueId, t]));
    let feeds = 0;
    for (const t of list) {
      if (t.online && t.system) {
        ensureFeed(t);
        feeds++;
      }
    }
    log(
      "catalog:",
      list.filter((t) => t.online).length + "/" + list.length,
      "online,",
      feeds,
      "feeds",
    );
  } catch (e) {
    log("catalog refresh failed:", e.message);
  }
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS });
  res.end(JSON.stringify(body));
}

function readBody(req, maxBytes = 1 << 20) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

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
  if (pathname === "/" || pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(dashboardHtml());
    return;
  }
  if (pathname === "/api/telescopes") {
    (async () => {
      const telescopes = await Promise.all(
        catalog.map(async (t) => {
          const frame = latest.get(t.teleUniqueId) || {};
          const object = await getObjectInfo(frame.astroObjectID);
          const pointing = computePointing(t, frame, object);
          ensureMissionTitle(t, frame.scheduledMissionID);
          return {
            ...t,
            currentImgURL: frame.currentImgURL || null,
            feedURL: t.online ? feedUrl(t) : null,
            mission: {
              imageID: frame.imageID || null,
              scheduledMissionID: frame.scheduledMissionID || null,
              astroObjectID: frame.astroObjectID || null,
              serverTime: frame.serverTime || null,
              missionTitle: getMissionTitleSync(t, frame.scheduledMissionID),
            },
            object: object
              ? {
                  ...object,
                  ...(pointing?.fromEphemeris
                    ? {
                        ra: pointing.ra,
                        dec: pointing.dec,
                        coordinatesDisplay: null,
                      }
                    : {}),
                  altAz: pointing?.altAz ?? null,
                }
              : null,
          };
        }),
      );
      json(res, 200, { timestamp: catalogTimestamp || Date.now(), telescopes });
    })();
    return;
  }
  if (pathname === "/api/image") {
    const target = url.searchParams.get("url");
    if (!target || !/^https?:\/\//.test(target)) {
      json(res, 400, { error: "missing or invalid url parameter" });
      return;
    }
    (async () => {
      try {
        const upstream = await fetch(target, { headers: { "User-Agent": UA } });
        if (!upstream.ok) {
          json(res, upstream.status, {
            error: "upstream HTTP " + upstream.status,
          });
          return;
        }
        const buffer = Buffer.from(await upstream.arrayBuffer());
        res.writeHead(200, {
          "Content-Type": upstream.headers.get("content-type") || "image/png",
          "Cache-Control": "no-store",
          ...CORS,
        });
        res.end(buffer);
      } catch (e) {
        json(res, 502, { error: e.message });
      }
    })();
    return;
  }
  if (pathname === "/api/captures" && req.method === "POST") {
    (async () => {
      const t0 = Date.now();
      try {
        let body = {};
        try {
          body = JSON.parse(await readBody(req));
        } catch (e) {
          json(res, 400, { error: "invalid request body" });
          return;
        }
        const teleUniqueId = body.teleUniqueId || body.telescopeId;
        const frame = latest.get(teleUniqueId);
        const target = frame && frame.currentImgURL;
        log(
          "capture request:",
          JSON.stringify(body),
          "| resolved id:",
          teleUniqueId,
          "| frame found:",
          !!frame,
          "| target:",
          target ? target.slice(0, 80) : null,
          "| latest keys:",
          JSON.stringify([...latest.keys()]),
        );
        if (!teleUniqueId || !target) {
          log("capture rejected (no frame)");
          json(res, 409, { error: "no frame available for this telescope" });
          return;
        }
        let slooh = { imagesAdded: 0, explanation: null };
        try {
          const snapBody = {
            callSource: "details",
            zoom: 1,
            originX: 0,
            originY: 0,
            masked: false,
            astroObjectID: frame.astroObjectID || "0",
            scheduledMissionID: frame.scheduledMissionID || "0",
            imageURL: target,
            imageID: frame.imageID || "",
          };
          log("capture snapping:", JSON.stringify(snapBody).slice(0, 300));
          const d = await api("/api/images/snapImage", snapBody);
          slooh = {
            imagesAdded: d.imagesAdded || 0,
            explanation: d.explanation || null,
            customerImageId: d.customerImageId
              ? Number(d.customerImageId)
              : null,
            duplicate: d.imagesAdded === 0 && !d.apiError,
          };
          if (slooh.duplicate && frame.imageID) {
            slooh.customerImageId = await findSnappedImageId(frame.imageID);
            slooh.explanation = "This image is already in your photos.";
          }
          log(
            "capture snap ok:",
            JSON.stringify({
              imagesAdded: slooh.imagesAdded,
              explanation: slooh.explanation,
              customerImageId: slooh.customerImageId,
              apiError: d.apiError,
              statusCode: d.statusCode,
              errorCode: d.errorCode,
              errorMsg: d.errorMsg,
            }),
          );
        } catch (e) {
          slooh.explanation = e.message;
          log("capture snap failed:", e.message);
        }
        log(
          "capture done in",
          Date.now() - t0,
          "ms ->",
          JSON.stringify({ slooh }),
        );
        json(res, 200, { slooh });
      } catch (e) {
        log("capture handler crashed:", e.stack || e.message);
        json(res, 502, { error: e.message });
      }
    })();
    return;
  }
  if (pathname === "/api/photos") {
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const pageSize = Math.min(
      60,
      Math.max(1, Number(url.searchParams.get("pageSize")) || 24),
    );
    (async () => {
      try {
        const d = await api("/api/images/getMyPictures", {
          pagingMode: "api",
          maxImageCount: pageSize,
          firstImageNumber: (page - 1) * pageSize + 1,
          viewType: "photoRoll",
        });
        if (d.apiError) {
          json(res, 502, { error: String(d.errorMsg || "slooh api error") });
          return;
        }
        const images = (d.imageList || []).map((i) => ({
          customerImageId: i.customerImageId,
          imageId: i.imageId,
          title: i.imageTitle || null,
          url: i.imageURL || null,
          downloadURL: i.imageDownloadURL || null,
          filename: i.imageFilename || null,
          displayDate: i.displayDate || null,
          displayTime: i.displayTime || null,
          imageTimestamp: i.imageTimestamp || null,
          observatoryName: i.overlayData?.observatoryName || null,
          telescopeName: i.telescopeName || null,
          instrumentName: i.instrumentName || null,
          objectId: i.objectId || null,
          scheduledMissionId: i.scheduledMissionId || null,
          shareToken: i.shareToken || null,
        }));
        json(res, 200, {
          page,
          pageSize,
          total: Number(d.totalCount) || images.length,
          images,
        });
      } catch (e) {
        json(res, 502, { error: e.message });
      }
    })();
    return;
  }
  if (pathname === "/api/missions") {
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
    return;
  }
  if (pathname === "/api/object") {
    const objectId = url.searchParams.get("objectId");
    if (!objectId) {
      json(res, 400, { error: "missing objectId parameter" });
      return;
    }
    (async () => {
      try {
        const d = await api("/api/object/getObjectData", {
          objectId,
          callSource: "details",
        });
        json(res, 200, d);
      } catch (e) {
        json(res, 502, { error: e.message });
      }
    })();
    return;
  }
  if (pathname === "/api/object-summary") {
    const objectId = url.searchParams.get("objectId");
    if (!objectId) {
      json(res, 400, { error: "missing objectId parameter" });
      return;
    }
    (async () => {
      try {
        const object = await getObjectInfo(objectId);
        let site = null;
        const obsName = url.searchParams.get("obsName");
        const timeSec = Number(url.searchParams.get("time")) || 0;
        let resolved = object;
        if (object && obsName) {
          const t = catalog.find((x) => x.obsName === obsName) ?? null;
          if (t) {
            site = {
              name: t.obsName,
              latitude: t.latitude,
              longitude: t.longitude,
              elevationM: t.elevationM,
            };
            if (timeSec) {
              const pointing = computePointing(
                t,
                { serverTime: timeSec },
                object,
              );
              if (pointing) {
                resolved = {
                  ...object,
                  ...(pointing.fromEphemeris
                    ? {
                        ra: pointing.ra,
                        dec: pointing.dec,
                        coordinatesDisplay: null,
                      }
                    : {}),
                  altAz: pointing.altAz,
                };
              }
            }
          }
        }
        json(res, 200, { object: resolved, site });
      } catch (e) {
        json(res, 502, { error: e.message });
      }
    })();
    return;
  }
  if (pathname === "/api/weather") {
    const obsId = url.searchParams.get("obsId");
    if (!obsId) {
      json(res, 400, { error: "missing obsId parameter" });
      return;
    }
    (async () => {
      try {
        const d = await get("/api/obs/getWXData", { obsId });
        json(res, 200, d);
      } catch (e) {
        json(res, 502, { error: e.message });
      }
    })();
    return;
  }
  if (pathname === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...CORS,
    });
    res.write("retry: 5000\n\n");
    for (const [uid, frame] of latest) {
      const t = telescopeById.get(uid);
      res.write(
        "data: " +
          JSON.stringify({
            type: "frame",
            telescopeId: t ? t.telescopeId : null,
            teleUniqueId: uid,
            frame,
            missionTitle: t
              ? getMissionTitleSync(t, frame.scheduledMissionID)
              : null,
          }) +
          "\n\n",
      );
    }
    subscribers.add(res);
    req.on("close", () => subscribers.delete(res));
    return;
  }
  if (pathname.startsWith("/sse/")) {
    const system = decodeURIComponent(pathname.slice(5));
    const t = catalog.find((x) => x.system === system);
    if (!t || !t.online || !t.system) {
      json(res, 404, { error: "no such stream" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...CORS,
    });
    res.write("retry: 15000\n\n");
    const ac = new AbortController();
    const sent = new Set();
    (async () => {
      try {
        for await (const { frame, id } of sloohFeed(system, ac.signal)) {
          const key =
            (frame.scheduledMissionID || "") + ":" + (frame.imageID || "");
          if (sent.has(key)) continue;
          sent.add(key);
          res.write("id: " + key + "\ndata: " + JSON.stringify(frame) + "\n\n");
        }
      } catch (e) {
        res.write("event: error\ndata: " + e.message + "\n\n");
      }
      res.end();
    })();
    req.on("close", () => ac.abort());
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

function dashboardHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Slooh feeds</title>
<style>
body{font-family:ui-monospace,monospace;background:#0a0f1e;color:#dfe7f5;margin:0;padding:24px}
h1{font-size:18px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
.card{background:#131a2e;border:1px solid #26314f;border-radius:10px;padding:12px}
.card.offline{opacity:.45}
.card .name{font-weight:700}
.card .meta{color:#8aa0c8;font-size:11px;margin:4px 0 10px}
.badge{display:inline-block;padding:1px 8px;border-radius:20px;font-size:10px;text-transform:uppercase}
.badge.online{background:#173b2a;color:#5ad98c}
.badge.offline{background:#3b1720;color:#e06c86}
.badge.sse{background:#1c2a4d;color:#7aa2ff;margin-left:6px}
.badge.video{background:#4d3a1c;color:#ffd27a;margin-left:6px}
img{width:100%;border-radius:6px;aspect-ratio:1;object-fit:cover;background:#000}
iframe{width:100%;aspect-ratio:16/9;border:0;border-radius:6px}
.empty{color:#5b6b8c;font-size:12px;padding:40px 0;text-align:center}
</style></head><body>
<h1>Slooh live feeds</h1><div class="grid" id="grid"></div>
<div class="empty" id="empty">loading...</div>
<script>
async function tick() {
  const r = await fetch('/api/telescopes');
  const { telescopes } = await r.json();
  document.getElementById('empty').style.display = telescopes.length ? 'none' : 'block';
  const grid = document.getElementById('grid');
  const seen = new Set();
  for (const t of telescopes) {
    seen.add(t.teleUniqueId);
    let el = document.getElementById('t-' + t.teleUniqueId);
    if (!el) {
      el = document.createElement('div');
      el.id = 't-' + t.teleUniqueId;
      el.className = 'card';
      el.innerHTML = '<div class="name">' + t.telescopeName + '</div><div class="meta">' + t.obsName + ' / ' + t.telescopeId + '</div>' +
        '<div class="badges"></div><div class="view"></div>';
      grid.appendChild(el);
    }
    el.className = 'card' + (t.online ? '' : ' offline');
    const badges = el.querySelector('.badges');
    const badge = t.online ? '<span class="badge online">online</span>' : '<span class="badge offline">offline</span>';
    const type = t.feedType === 'video' ? '<span class="badge video">youtube</span>' : (t.feedType === 'sse' ? '<span class="badge sse">sse</span>' : '');
    badges.innerHTML = badge + type;
    const view = el.querySelector('.view');
    if (t.feedType === 'video' && t.online) {
      view.innerHTML = '<iframe src="' + (t.feedURL || '') + '" allow="autoplay; fullscreen" allowfullscreen></iframe>';
    } else if (t.feedType === 'sse' && t.online) {
      view.innerHTML = t.currentImgURL ? '<img src="' + t.currentImgURL + '">' : '';
    } else {
      view.innerHTML = '';
    }
  }
  for (const el of grid.children) if (!seen.has(el.id.replace('t-', ''))) el.remove();
}
setInterval(tick, 5000);
tick();
</script></body></html>`;
}
