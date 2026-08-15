import { json } from "../responses.js";
import { log } from "../config.js";
import { api } from "../sloohClient.js";

export function handlePhotos(req, res, url, pathname) {
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(
    60,
    Math.max(1, Number(url.searchParams.get("pageSize")) || 24),
  );
  (async () => {
    try {
      const d = await api("/api/images/getMyPictures", {
        pagingMode: "api",
        maxImageCount: pageSize,
        firstImageNumber: (page - 1) * pageSize + 1,
        viewType: "photoRoll",
      });
      if (d.apiError) {
        json(res, 502, { error: String(d.errorMsg || "slooh api error") });
        return;
      }
      const images = (d.imageList || []).map((i) => ({
        customerImageId: i.customerImageId,
        imageId: i.imageId,
        title: i.imageTitle || null,
        url: i.imageURL || null,
        downloadURL: i.imageDownloadURL || null,
        filename: i.imageFilename || null,
        displayDate: i.displayDate || null,
        displayTime: i.displayTime || null,
        imageTimestamp: i.imageTimestamp || null,
        observatoryName: i.overlayData?.observatoryName || null,
        telescopeName: i.telescopeName || null,
        instrumentName: i.instrumentName || null,
        objectId: i.objectId || null,
        scheduledMissionId: i.scheduledMissionId || null,
        shareToken: i.shareToken || null,
      }));
      json(res, 200, {
        page,
        pageSize,
        total: Number(d.totalCount) || images.length,
        images,
      });
    } catch (e) {
      json(res, 502, { error: e.message });
    }
  })();
}
