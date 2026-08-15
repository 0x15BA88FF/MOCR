import { APP, UA, log } from "./config.js";
import { setCatalog, setCatalogTimestamp, setTelescopeById } from "./state.js";
import { ensureFeed } from "./feeds.js";

async function sloohPost(apiPath, body) {
  const res = await fetch(APP + apiPath, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function login() {
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
  return { cid: d.cid, at: d.at, token: d.token };
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

async function refreshCatalog() {
  try {
    const list = await fetchCatalog();
    setCatalog(list);
    setCatalogTimestamp(Date.now());
    setTelescopeById(new Map(list.map((t) => [t.teleUniqueId, t])));
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

export {
  sloohPost,
  login,
  getSession,
  api,
  get,
  parseDms,
  parseElevationMeters,
  fetchCatalog,
  youtubeVideoId,
  feedUrl,
  cleanHtml,
  refreshCatalog,
};
