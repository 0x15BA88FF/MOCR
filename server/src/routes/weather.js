import { json } from "../responses.js";
import { get } from "../sloohClient.js";

export function handleWeather(req, res, url, pathname) {
  const obsId = url.searchParams.get("obsId");
  if (!obsId) {
    json(res, 400, { error: "missing obsId parameter" });
    return;
  }
  (async () => {
    try {
      const d = await get("/api/obs/getWXData", { obsId });
      json(res, 200, d);
    } catch (e) {
      json(res, 502, { error: e.message });
    }
  })();
}
