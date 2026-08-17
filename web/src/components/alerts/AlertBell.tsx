import { useEffect, useRef, useState } from "react"
import { Bell, Check, ExternalLink } from "lucide-react"
import { usePolling } from "@/lib/usePolling"
import type { SloohAlert } from "@/lib/slooh"

function extractImageId(linkUrl: string | null): number | null {
  if (!linkUrl) return null
  const m = String(linkUrl).match(/\/show-image\/(\d+)/)
  return m ? Number(m[1]) : null
}

export function AlertBell({
  enabled = true,
  onOpenPhoto,
}: {
  enabled?: boolean
  onOpenPhoto?: (customerImageId: number) => void
}) {
  const [open, setOpen] = useState(false)
  const { data, refresh } = usePolling<{
    notificationsCount: number
    alertCount: number
    alerts: SloohAlert[]
  }>("/api/alerts", { enabled, intervalMs: 60_000 })
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    window.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  const count = data?.notificationsCount ?? 0
  const alerts = data?.alerts ?? []
  const prevCountRef = useRef(count)

  useEffect(() => {
    if (
      count > prevCountRef.current &&
      document.visibilityState === "hidden" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      const fresh = alerts.find((a) => a.isNewEvent)
      try {
        new Notification("MOCR · new Slooh alert", {
          body: fresh ? (fresh.eventTitle ?? fresh.eventLabel ?? "You have a new alert") : `${count - prevCountRef.current} new alert${count - prevCountRef.current > 1 ? "s" : ""}`,
          icon: "/favicon.svg",
          tag: "mocr-alert",
        })
      } catch {}
    }
    prevCountRef.current = count
  }, [count, alerts])

  const dismiss = async (alert: SloohAlert) => {
    try {
      await fetch("/api/alerts/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: alert.eventId }),
      })
      refresh()
    } catch {
      refresh()
    }
  }

  const openLink = (alert: SloohAlert) => {
    const id = extractImageId(alert.linkUrl)
    if (id && onOpenPhoto) {
      onOpenPhoto(id)
      setOpen(false)
      return
    }
    window.open("https://app.slooh.com" + alert.linkUrl, "_blank", "noopener")
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Alerts (${count} unread)`}
        aria-expanded={open}
        className="relative flex size-8 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
      >
        <Bell className="size-4" />
        {count > 0 ? (
          <span className="absolute top-0.5 right-0.5 flex size-3.5 items-center justify-center bg-red-600 font-mono text-[8px] font-semibold text-white tabular-nums">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute top-full right-0 z-20 mt-1 flex max-h-72 w-72 flex-col border border-border bg-card shadow-lg max-sm:fixed max-sm:top-16 max-sm:right-4 max-sm:left-4 max-sm:w-auto">
          <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
            <span className="text-[9px] tracking-wider text-muted-foreground uppercase">
              Alerts · {count} unread
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex size-5 items-center justify-center text-muted-foreground hover:text-foreground"
            >
              <Bell className="size-3" />
            </button>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {alerts.length === 0 ? (
              <li className="px-2 py-3 text-center text-[10px] text-muted-foreground">
                no alerts right now
              </li>
            ) : (
              alerts.map((a) => (
                <li
                  key={a.eventId}
                  className="flex flex-col gap-1 border-b border-border/60 px-2 py-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-[10px] leading-snug text-foreground">
                      {a.eventLabel ?? a.eventTitle ?? "Alert"}
                    </span>
                    {a.isNewEvent ? (
                      <span className="shrink-0 rounded-full bg-primary/20 px-1 font-mono text-[8px] tracking-wider text-primary uppercase">
                        new
                      </span>
                    ) : null}
                  </div>
                  {a.eventTitle && a.eventLabel !== a.eventTitle ? (
                    <p className="truncate text-[10px] text-muted-foreground">
                      {a.eventTitle}
                    </p>
                  ) : null}
                  <div className="flex items-center justify-end gap-1">
                    {a.hasLink && a.linkUrl ? (
                      <button
                        type="button"
                        onClick={() => openLink(a)}
                        className="flex items-center gap-1 border border-border bg-background px-1.5 py-0.5 text-[8px] tracking-wider text-muted-foreground uppercase transition-colors hover:border-primary hover:text-foreground"
                      >
                        <ExternalLink className="size-2.5" />
                        Open
                      </button>
                    ) : null}
                    {a.canDismiss ? (
                      <button
                        type="button"
                        onClick={() => dismiss(a)}
                        title="Dismiss"
                        className="flex size-5 items-center justify-center border border-border bg-background text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                      >
                        <Check className="size-2.5" />
                      </button>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}