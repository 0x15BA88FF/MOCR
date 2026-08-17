import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { ROOT, log } from "./config.js";

const VAPID_FILE = path.join(ROOT, "vapid.json");
const SUBS_FILE = path.join(ROOT, "data", "push-subscriptions.json");

const subs = new Map();
let publicKeyCache = null;

function ensureVapid() {
  if (
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  ) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    publicKeyCache = process.env.VAPID_PUBLIC_KEY;
    return;
  }
  if (existsSync(VAPID_FILE)) {
    const keys = JSON.parse(readFileSync(VAPID_FILE, "utf8"));
    webpush.setVapidDetails(
      "mailto:mocr@localhost",
      keys.publicKey,
      keys.privateKey,
    );
    publicKeyCache = keys.publicKey;
    return;
  }
  const keys = webpush.generateVAPIDKeys();
  writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2));
  webpush.setVapidDetails("mailto:mocr@localhost", keys.publicKey, keys.privateKey);
  publicKeyCache = keys.publicKey;
  log("generated new VAPID keys in", VAPID_FILE);
}

function loadSubs() {
  try {
    if (!existsSync(SUBS_FILE)) return;
    const list = JSON.parse(readFileSync(SUBS_FILE, "utf8"));
    for (const s of list) if (s?.endpoint) subs.set(s.endpoint, s);
    log("push subscriptions loaded:", subs.size);
  } catch (e) {
    log("push subscriptions load failed:", e.message);
  }
}

function saveSubs() {
  try {
    mkdirSync(path.dirname(SUBS_FILE), { recursive: true });
    writeFileSync(
      SUBS_FILE,
      JSON.stringify([...subs.values()], null, 2),
    );
  } catch (e) {
    log("push subscriptions save failed:", e.message);
  }
}

let ready = false;

export function initPush() {
  if (ready) return;
  try {
    ensureVapid();
    loadSubs();
    ready = true;
  } catch (e) {
    log("push init failed:", e.message);
  }
}

export function pushSupported() {
  return ready;
}

export function pushConfigure() {
  return {
    supported: ready,
    publicKey: publicKeyCache,
    subscriberCount: subs.size,
  };
}

export function subscribePush(subscription) {
  if (!subscription || !subscription.endpoint) return false;
  subs.set(subscription.endpoint, {
    endpoint: subscription.endpoint,
    keys: subscription.keys || null,
    expirationTime: subscription.expirationTime ?? null,
    createdAt: Date.now(),
  });
  saveSubs();
  return true;
}

export function unsubscribePush(endpoint) {
  const removed = subs.delete(endpoint);
  if (removed) saveSubs();
  return removed;
}

export function pushSubscriptionCount() {
  return subs.size;
}

async function sendOne(sub, title, body, url) {
  const payload = JSON.stringify({
    title,
    body,
    url,
    timestamp: Date.now(),
  });
  try {
    await webpush.sendNotification(sub, payload, { TTL: 3600 });
    return { ok: true };
  } catch (e) {
    const code = e?.statusCode ?? 0;
    if (code === 404 || code === 410) {
      log("push: dropping stale subscription", sub.endpoint.slice(0, 60));
      subs.delete(sub.endpoint);
      saveSubs();
      return { ok: false, dropped: true };
    }
    return { ok: false, error: e.message };
  }
}

export async function sendPush(title, body, url = "/telescope") {
  const list = [...subs.values()];
  if (list.length === 0) return { sent: 0, total: 0 };
  const results = await Promise.all(
    list.map((s) => sendOne(s, title, body, url)),
  );
  return {
    sent: results.filter((r) => r.ok).length,
    dropped: results.filter((r) => r.dropped).length,
    failed: results.filter((r) => !r.ok && !r.dropped).length,
    total: list.length,
  };
}