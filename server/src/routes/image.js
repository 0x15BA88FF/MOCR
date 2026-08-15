import { json } from "../responses.js";
import { UA, CORS } from "../config.js";

export function handleImage(req, res, url, pathname) {
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
}
