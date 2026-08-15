import { json } from "../responses.js";
import { catalog, catalogTimestamp, latest } from "../state.js";
import { getObjectInfo } from "../objects.js";
import { computePointing } from "../pointing.js";
import { ensureMissionTitle, getMissionTitleSync } from "../missions.js";
import { feedUrl } from "../sloohClient.js";

export function handleTelescopes(req, res, url, pathname) {
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
}
