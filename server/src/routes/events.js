import { json } from "../responses.js";
import { latest, telescopeById, subscribers } from "../state.js";
import { getMissionTitleSync } from "../missions.js";
import { CORS } from "../config.js";

export function handleEvents(req, res, url, pathname) {
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
}
