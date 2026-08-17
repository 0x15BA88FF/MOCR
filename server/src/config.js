import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const APP = "https://app.slooh.com";
export const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
export const CATALOG_REFRESH_MS = 60_000;
export const RECONNECT_MS = 5_000;

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Last-Event-ID",
};

export const PUBLIC_DIST = path.join(ROOT, "../web/dist");

export const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

export const log = (...a) =>
  console.log(new Date().toISOString().slice(11, 19), ...a);

export function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || m[1] in process.env) continue;
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}
loadEnv();

export const PORT = Number(
  process.env.PORT || process.env.SLOOH_PROXY_PORT || 8270,
);
export const API_KEY = process.env.API_KEY || "";
export const WEB_PASSWORD = process.env.WEB_PASSWORD || process.env.API_KEY || "";
export const AUTH_ENABLED = Boolean(WEB_PASSWORD || API_KEY);
export const DEBUG = process.env.DEBUG === "1" || process.env.DEBUG === "true";
