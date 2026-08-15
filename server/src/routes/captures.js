import { json, readBody } from "../responses.js";
import { log } from "../config.js";
import { latest } from "../state.js";
import { api } from "../sloohClient.js";
import { findSnappedImageId } from "../missions.js";

export function handleCaptures(req, res, url, pathname) {
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
      let d;
      try {
        log("capture snapping:", JSON.stringify(snapBody).slice(0, 300));
        d = await api("/api/images/snapImage", snapBody);
      } catch (e) {
        log("capture snap failed:", e.message);
        json(res, 502, {
          error: "could not save capture to your Slooh account: " + e.message,
        });
        return;
      }
      const slooh = {
        imagesAdded: d.imagesAdded || 0,
        explanation: d.explanation || null,
        customerImageId: d.customerImageId ? Number(d.customerImageId) : null,
        duplicate: d.imagesAdded === 0 && !d.apiError,
      };
      if (slooh.duplicate && frame.imageID) {
        slooh.customerImageId = await findSnappedImageId(frame.imageID);
        slooh.explanation = "This image is already in your photos.";
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
}
