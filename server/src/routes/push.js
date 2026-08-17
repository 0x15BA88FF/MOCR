import { json, readBody } from "../responses.js";
import { log } from "../config.js";
import {
  initPush,
  pushSupported,
  pushConfigure,
  subscribePush,
  unsubscribePush,
  sendPush,
} from "../push.js";

export function handlePushConfigure(req, res, url, pathname) {
  initPush();
  json(res, 200, pushConfigure());
}

export function handlePushSubscribe(req, res, url, pathname) {
  (async () => {
    try {
      initPush();
      let body = {};
      try {
        body = JSON.parse(await readBody(req));
      } catch (e) {
        json(res, 400, { error: "invalid request body" });
        return;
      }
      if (!body.endpoint) {
        json(res, 400, { error: "missing endpoint" });
        return;
      }
      if (!pushSupported()) {
        json(res, 500, { error: "push not configured on server" });
        return;
      }
      const ok = subscribePush({
        endpoint: body.endpoint,
        keys: body.keys || null,
        expirationTime: body.expirationTime ?? null,
      });
      json(res, 200, { subscribed: ok, count: pushConfigure().subscriberCount });
    } catch (e) {
      log("push subscribe failed:", e.message);
      json(res, 502, { error: e.message });
    }
  })();
}

export function handlePushUnsubscribe(req, res, url, pathname) {
  (async () => {
    try {
      let body = {};
      try {
        body = JSON.parse(await readBody(req));
      } catch (e) {
        json(res, 400, { error: "invalid request body" });
        return;
      }
      if (!body.endpoint) {
        json(res, 400, { error: "missing endpoint" });
        return;
      }
      const removed = unsubscribePush(body.endpoint);
      json(res, 200, { unsubscribed: removed });
    } catch (e) {
      log("push unsubscribe failed:", e.message);
      json(res, 502, { error: e.message });
    }
  })();
}

export function handlePushTest(req, res, url, pathname) {
  (async () => {
    try {
      initPush();
      const result = await sendPush(
        "MOCR · push test",
        "This is a test push notification from MOCR.",
        "/telescope",
      );
      json(res, 200, result);
    } catch (e) {
      log("push test failed:", e.message);
      json(res, 502, { error: e.message });
    }
  })();
}

export function handlePushSend(req, res, url, pathname) {
  (async () => {
    try {
      let body = {};
      try {
        body = JSON.parse(await readBody(req));
      } catch (e) {
        json(res, 400, { error: "invalid request body" });
        return;
      }
      if (!body.title) {
        json(res, 400, { error: "missing title" });
        return;
      }
      const result = await sendPush(
        body.title,
        body.body || "",
        body.url || "/telescope",
      );
      json(res, 200, result);
    } catch (e) {
      log("push send failed:", e.message);
      json(res, 502, { error: e.message });
    }
  })();
}