import { json } from "../responses.js";
import { catalog } from "../state.js";
import { sloohFeed } from "../feeds.js";
import { log, CORS } from "../config.js";

export function handleSseProxy(req, res, url, pathname) {
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
}
