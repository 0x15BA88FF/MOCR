self.addEventListener("push", (event) => {
  let payload = { title: "MOCR", body: "", url: "/telescope" }
  try {
    payload = Object.assign(payload, event.data ? event.data.json() : {})
  } catch {}
  event.waitUntil(
    self.registration.showNotification(payload.title || "MOCR", {
      body: payload.body || "",
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: payload.tag || "mocr",
      data: { url: payload.url || "/telescope" },
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification.data?.url || "/telescope"
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ("focus" in client) {
            client.navigate(url)
            return client.focus()
          }
        }
        return self.clients.openWindow(url)
      }),
  )
})

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})