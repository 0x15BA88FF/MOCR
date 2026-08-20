import { APP, UA, RECONNECT_MS, log } from "./config.js";
import {
  latest,
  subscribers,
  activeFeeds,
  telescopeById,
  objectCache,
} from "./state.js";
import { getObjectInfo } from "./objects.js";
import { ensureMissionTitle, getMissionTitleSync } from "./missions.js";

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

function broadcast(payload) {
  const text = "data: " + JSON.stringify(payload) + "\n\n";
  for (const res of subscribers) {
    try {
      res.write(text);
    } catch {
      subscribers.delete(res);
    }
  }
}

function ensureFeed(t) {
  if (activeFeeds.has(t.system)) return;
  activeFeeds.add(t.system);
  const ac = new AbortController();
  const run = async () => {
    try {
      for await (const { frame } of sloohFeed(t.system, ac.signal)) {
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

export { sloohFeed, ensureFeed, broadcast };
