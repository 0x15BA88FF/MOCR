import { AUTH_ENABLED, API_KEY } from "./config.js";
import { sessions } from "./state.js";

export function isAuthenticated(req, url) {
  if (!AUTH_ENABLED) return true;
  const authHeader = req.headers["authorization"];
  const apiKeyHeader =
    req.headers["x-api-key"] || url.searchParams.get("api_key");
  if (API_KEY) {
    if (apiKeyHeader === API_KEY) return true;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      if (authHeader.slice(7).trim() === API_KEY) return true;
    }
  }
  const cookieHeader = req.headers["cookie"] || "";
  const cookies = {};
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx !== -1) {
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      cookies[k] = v;
    }
  }
  const sessionToken = cookies["mocr_session"];
  if (sessionToken && sessions.has(sessionToken)) {
    return true;
  }
  return false;
}
