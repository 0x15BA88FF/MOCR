function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const out = new Uint8Array(raw.length) as Uint8Array<ArrayBuffer>
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    window.isSecureContext
  )
}

export async function getPublicKey(): Promise<string | null> {
  try {
    const res = await fetch("/api/push/configure")
    const json = await res.json()
    return json?.supported ? (json.publicKey as string) : null
  } catch {
    return null
  }
}

export async function enablePush(): Promise<{
  ok: boolean
  reason?: "unsupported" | "denied" | "unavailable" | string
}> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" }
  try {
    const permission = await Notification.requestPermission()
    if (permission !== "granted") return { ok: false, reason: "denied" }
    const key = await getPublicKey()
    if (!key) return { ok: false, reason: "unavailable" }
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
    await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    })
    const body = JSON.parse(JSON.stringify(sub)) as {
      endpoint: string
      keys: { p256dh: string; auth: string }
      expirationTime: number | null
    }
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok || !json.subscribed) {
      return { ok: false, reason: json.error || `HTTP ${res.status}` }
    }
    localStorage.setItem("mocr_push_enabled", "1")
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "failed" }
  }
}

export async function disablePush(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/")
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      const endpoint = sub.endpoint
      await sub.unsubscribe()
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      }).catch(() => {})
    }
    localStorage.removeItem("mocr_push_enabled")
    return true
  } catch {
    localStorage.removeItem("mocr_push_enabled")
    return false
  }
}

export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.getRegistration("/")
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) {
      localStorage.removeItem("mocr_push_enabled")
      return false
    }
    return true
  } catch {
    return false
  }
}

export async function sendTestPush(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
    const json = await res.json()
    if (!res.ok) return { ok: false, error: json.error || `HTTP ${res.status}` }
    if (json.sent === 0) return { ok: true, error: undefined }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "failed" }
  }
}