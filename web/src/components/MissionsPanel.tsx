import { useCallback, useEffect, useState } from "react"
import { CalendarClock, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SloohTelescope } from "@/lib/slooh"

interface MissionInfo {
  scheduledMissionId: number | null
  title: string | null
  missionStart: number | null
  durationSec: number | null
  expires: number | null
}

interface SlotInfo extends Omit<MissionInfo, "expires"> {
  missionType: string | null
  slotStatus: string | null
}

interface TelescopeMissions {
  teleUniqueId: string
  current: MissionInfo | null
  next: SlotInfo | null
  upcoming: SlotInfo[]
}

function formatDuration(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
    : `${m}:${String(r).padStart(2, "0")}`
}

function formatTime(epochSec: number) {
  return new Date(epochSec * 1000).toISOString().slice(11, 16) + " UTC"
}

export default function MissionsPanel({
  active,
  telescopes,
}: {
  active: boolean
  telescopes: SloohTelescope[]
}) {
  const [data, setData] = useState<Record<string, TelescopeMissions>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const uidsKey = telescopes.map((t) => t.teleUniqueId).join(",")

  const fetchMissions = useCallback(async () => {
    if (!uidsKey) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/missions?uids=${encodeURIComponent(uidsKey)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const byId: Record<string, TelescopeMissions> = {}
      for (const m of json.missions ?? []) byId[m.teleUniqueId] = m
      setData(byId)
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed")
    } finally {
      setLoading(false)
    }
  }, [uidsKey])

  useEffect(() => {
    if (!active) return
    fetchMissions()
    const timer = setInterval(fetchMissions, 30_000)
    return () => clearInterval(timer)
  }, [active, fetchMissions])

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])

  const nowSec = Math.floor(now / 1000)

  return (
    <div className={cn("min-h-0 flex-1 flex-col", active ? "flex" : "hidden")}>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {error ? (
          <p className="border border-red-900/60 bg-red-950/30 px-2 py-1.5 text-[10px] leading-relaxed text-red-300">
            failed to load missions ({error}). Start the server with{" "}
            <code className="text-red-200">pnpm dev:server</code>.
          </p>
        ) : null}
        {!error && telescopes.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] leading-relaxed text-muted-foreground">
            Select telescopes in the Telescopes tab to see their current and
            upcoming missions.
          </p>
        ) : null}
        {!error && telescopes.length > 0 && loading && Object.keys(data).length === 0 ? (
          <div className="flex flex-col gap-2">
            {telescopes.map((t) => (
              <div key={t.teleUniqueId} className="h-24 animate-pulse border border-border bg-card" />
            ))}
          </div>
        ) : null}
        {telescopes.map((t) => {
          const m = data[t.teleUniqueId]
          if (!m) return null
          const current = m.current
          const countdown = current?.expires ? current.expires - nowSec : null
          const startIn = current?.missionStart ? current.missionStart - nowSec : null
          const next = m.next
          const nextIn = next?.missionStart ? next.missionStart - nowSec : null
          return (
            <div key={t.teleUniqueId} className="mb-3 border border-border bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5">
                <span className="truncate text-[11px] font-medium text-foreground">
                  {t.telescopeName}
                </span>
                <span className="flex items-center gap-1 text-[9px] tracking-wider text-muted-foreground uppercase">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      t.online ? "bg-emerald-400" : "bg-muted-foreground/40",
                    )}
                  />
                  {t.obsName}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 px-2.5 py-2">
                {current ? (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] tracking-wider text-muted-foreground uppercase">
                        {countdown !== null && countdown > 0 ? "now" : "starting"}
                      </p>
                      <p className="truncate text-xs font-medium text-foreground">
                        {current.title ?? "Mission"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 font-mono text-xs tabular-nums",
                        countdown !== null && countdown > 0 && countdown < 120
                          ? "text-amber-300"
                          : "text-foreground",
                      )}
                    >
                      {countdown !== null && countdown > 0
                        ? formatDuration(countdown)
                        : startIn !== null && startIn > 0
                          ? formatDuration(startIn)
                          : ""}
                    </span>
                  </div>
                ) : null}
                {next ? (
                  <div className="flex items-start justify-between gap-2 border-t border-border/60 pt-1.5">
                    <div className="min-w-0">
                      <p className="text-[10px] tracking-wider text-muted-foreground uppercase">
                        next
                      </p>
                      <p className="truncate text-xs text-foreground">
                        {next.title ?? "Mission"}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {formatTime(next.missionStart!)}
                      {nextIn !== null && nextIn > 0 ? ` · ${formatDuration(nextIn)}` : ""}
                    </span>
                  </div>
                ) : current ? (
                  <p className="border-t border-border/60 pt-1.5 text-[10px] text-muted-foreground">
                    no further missions scheduled today
                  </p>
                ) : null}
                {!current && !next && m.upcoming.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground">
                    no mission schedule available
                  </p>
                ) : null}
                {m.upcoming.length > 0 ? (
                  <ul className="mt-0.5 flex flex-col border-t border-border/60 pt-1.5">
                    {m.upcoming.slice(0, 5).map((u, i) => (
                      <li
                        key={u.scheduledMissionId ?? i}
                        className="flex items-center justify-between gap-2 py-0.5 text-[11px]"
                      >
                        <span className="truncate text-muted-foreground">
                          {u.title ?? "Mission"}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/70">
                          {formatTime(u.missionStart!)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          )
        })}
        {!error && telescopes.length > 0 && !loading && Object.keys(data).length > 0 ? (
          <p className="flex items-center justify-center gap-1.5 py-2 text-[9px] tracking-wider text-muted-foreground/60 uppercase">
            <CalendarClock className="size-3" />
            refreshes automatically
          </p>
        ) : null}
        {!error && telescopes.length > 0 && !loading ? (
          <button
            type="button"
            onClick={fetchMissions}
            className="mt-1 flex h-8 w-full items-center justify-center gap-1.5 border border-border bg-card text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </button>
        ) : null}
      </div>
    </div>
  )
}
