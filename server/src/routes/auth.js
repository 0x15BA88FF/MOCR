import { json, readBody } from "../responses.js";
import { AUTH_ENABLED, WEB_PASSWORD, CORS, API_KEY } from "../config.js";
import { isAuthenticated } from "../auth.js";
import { sessions } from "../state.js";

export function handleAuthStatus(req, res, url) {
  json(res, 200, {
    authenticated: isAuthenticated(req, url),
    authRequired: AUTH_ENABLED,
  });
}

export function handleLogin(req, res, url) {
  (async () => {
    try {
      const body = JSON.parse(await readBody(req));
      const password = body.password;
      if (!AUTH_ENABLED || password === WEB_PASSWORD) {
        const token =
          Math.random().toString(36).slice(2) +
          Math.random().toString(36).slice(2);
        sessions.set(token, { createdAt: Date.now() });
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Set-Cookie": `mocr_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
          ...CORS,
        });
        res.end(JSON.stringify({ success: true }));
      } else {
        json(res, 401, { error: "Invalid password or API key" });
      }
    } catch (e) {
      json(res, 400, { error: "Invalid request body" });
    }
  })();
}

export function handleLogout(req, res) {
  const cookieHeader = req.headers["cookie"] || "";
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx !== -1 && part.slice(0, idx).trim() === "mocr_session") {
      sessions.delete(part.slice(idx + 1).trim());
    }
  }
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Set-Cookie": `mocr_session=; Path=/; HttpOnly; Max-Age=0`,
    ...CORS,
  });
  res.end(JSON.stringify({ success: true }));
}
