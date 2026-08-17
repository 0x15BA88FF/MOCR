import { useCallback, useEffect, useState } from "react"
import { RefreshCw, Search, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SloohTelescope, SloohRecommend } from "@/lib/slooh"

interface MissionInfo {
  scheduledMissionId: number | null
  title: string | null
  missionStart: number | null
  durationSec: number | null
  expires: number | null
  astroObjectID: string | null
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

interface MissionLimits {
  allowMissionReservation: boolean
  showMissions: boolean
  missionQuota: { maxCount: number; inUseCount: number; availableCount: number }
  missionsQuotaMsg: string | null
  missionsLimitMsg: string | null
  showAdvancedMissions: boolean
  allowAdvancedMissionReservation: boolean
  advancedMissionQuota: {
    maxCount: number
    inUseCount: number
    availableCount: number
  }
  advancedMissionsQuotaMsg: string | null
  advancedMissionsLimitMsg: string | null
}

interface SlotDetailed {
  scheduledMissionId: number | null
  missionStart: number | null
  durationSec: number | null
  missionType: string | null
  slotStatus: string | null
  slotTitle: string | null
  allowButtons: {
    browse: boolean
    slooh1000: boolean
    constellation: boolean
    catalog: boolean
    coordinate: boolean
    piggyback: boolean
    join: boolean
  }
  owner: string | null
  ownerMembershipType: string | null
}

interface SearchObject {
  objectId: string | null
  objectTitle: string | null
  objectType: string | null
  objectRA: number | null
  objectDec: number | null
objectConstellation: string | null
  objectIconURL: string | null
}

interface RecState {
  data: SloohRecommend | null
  error: string | null
  busy: boolean
  reserveBusy: boolean
  message: string | null
}

interface PlannerState {
  q: string
  results: SearchObject[]
  searching: boolean
  selected: SearchObject | null
  teleUniqueId: string | null
  slot: SlotDetailed | null
  reserving: boolean
  message: string | null
  error: string | null
}

function emptyPlanner(): PlannerState {
  return {
    q: "",
    results: [],
    searching: false,
    selected: null,
    teleUniqueId: null,
    slot: null,
    reserving: false,
    message: null,
    error: null,
  }
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

function formatDate(epochSec: number) {
  return new Date(epochSec * 1000).toISOString().slice(5, 10).replace("-", "/")
}

export default function MissionsPanel({
  active,
  telescopes,
}: {
  active: boolean
  telescopes: SloohTelescope[]
}) {
  const [data, setData] = useState<Record<string, TelescopeMissions>>({})
  const [limits, setLimits] = useState<MissionLimits | null>(null)
  const [slots, setSlots] = useState<Record<string, SlotDetailed[]>>({})
  const [planner, setPlanner] = useState<PlannerState>(emptyPlanner())
  const [recs, setRecs] = useState<Record<string, RecState>>({})
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

  const fetchLimits = useCallback(async () => {
    try {
      const res = await fetch("/api/mission-limits")
      if (!res.ok) return
      const json = await res.json()
      setLimits(json.limits ?? null)
    } catch {
      setLimits(null)
    }
  }, [])

  const fetchSlots = useCallback(async () => {
    if (!uidsKey) return
    const per: Record<string, SlotDetailed[]> = {}
    await Promise.all(
      telescopes.map(async (t) => {
        try {
          if (!t.obsId || !t.telescopeId) return
          const qs = new URLSearchParams({
            obsId: t.obsId,
            telescopeId: t.telescopeId,
            domeId: String(t.domeId ?? 0),
          })
          const res = await fetch(`/api/mission-slots?${qs}`)
          if (!res.ok) return
          const json = await res.json()
          per[t.teleUniqueId] = (json.slots ?? []).filter(
            (s: SlotDetailed) =>
              s.slotStatus === "available" && s.missionStart != null,
          )
        } catch {
          per[t.teleUniqueId] = []
        }
      }),
    )
    setSlots(per)
  }, [uidsKey, telescopes])

  useEffect(() => {
    if (!active) return
    fetchMissions()
    fetchLimits()
    fetchSlots()
    const timer = setInterval(() => {
      fetchMissions()
      fetchLimits()
      fetchSlots()
    }, 30_000)
    return () => clearInterval(timer)
  }, [active, fetchMissions, fetchLimits, fetchSlots])

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])

  const searchObjects = useCallback(
    async (_teleUniqueId: string, q: string) => {
      if (!q.trim()) return
      setPlanner((p) => ({ ...p, searching: true, message: null, error: null }))
      try {
        const res = await fetch(
          `/api/mission-search?q=${encodeURIComponent(q.trim())}`,
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
        setPlanner((p) => ({ ...p, results: json.objects ?? [], searching: false }))
      } catch (e) {
        setPlanner((p) => ({
          ...p,
          results: [],
          searching: false,
          error: e instanceof Error ? e.message : "search failed",
        }))
      }
    },
    [],
  )

  const reserve = useCallback(
    async (t: SloohTelescope, slot: SlotDetailed, obj: SearchObject) => {
      if (!obj?.objectId) return
      setPlanner((p) => ({ ...p, reserving: true, message: null, error: null }))
      try {
        const res = await fetch("/api/mission/reserve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teleUniqueId: t.teleUniqueId,
            scheduledMissionId: slot.scheduledMissionId,
            missionStart: slot.missionStart,
            object: {
              objectId: obj.objectId,
              objectTitle: obj.objectTitle,
              objectType: obj.objectType,
              objectRA: obj.objectRA,
              objectDec: obj.objectDec,
              objectIconURL: obj.objectIconURL,
            },
          }),
        })
        const json = await res.json()
        if (json.error) {
          setPlanner((p) => ({ ...p, reserving: false, error: json.error }))
        } else {
          setPlanner((p) => ({
            ...p,
            reserving: false,
            q: "",
            results: [],
            selected: null,
            slot: null,
            teleUniqueId: null,
            message: `Reserved ${obj.objectTitle ?? "mission"} for ${formatDate(slot.missionStart!)} ${formatTime(slot.missionStart!)}`,
          }))
          fetchMissions()
          fetchLimits()
          fetchSlots()
        }
      } catch (e) {
        setPlanner((p) => ({
          ...p,
          reserving: false,
          error: e instanceof Error ? e.message : "reservation failed",
        }))
      }
    },
[fetchMissions, fetchLimits, fetchSlots],
  )

  const fetchRecommend = useCallback(async (teleUniqueId: string, objectId: string) => {
    if (!objectId) return
    setRecs((prev) => ({ ...prev, [teleUniqueId]: { data: null, error: null, busy: true, reserveBusy: false, message: null } }))
    try {
      const res = await fetch(`/api/recommend?objectId=${encodeURIComponent(objectId)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setRecs((prev) => ({
        ...prev,
        [teleUniqueId]: { data: json, error: null, busy: false, reserveBusy: prev[teleUniqueId]?.reserveBusy ?? false, message: prev[teleUniqueId]?.message ?? null },
      }))
    } catch (e) {
      setRecs((prev) => ({
        ...prev,
        [teleUniqueId]: { data: null, error: e instanceof Error ? e.message : "recommend failed", busy: false, reserveBusy: false, message: null },
      }))
    }
  }, [])

  const reserveRecommend = useCallback(
    async (t: SloohTelescope, rec: SloohRecommend) => {
      const slot = rec.slot
      const obj = rec.object
      if (!slot || !obj) return
      setRecs((prev) => ({ ...prev, [t.teleUniqueId]: { ...prev[t.teleUniqueId], data: rec, reserveBusy: true, message: null } }))
      try {
        const res = await fetch("/api/mission/reserve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teleUniqueId: t.teleUniqueId,
            scheduledMissionId: slot.scheduledMissionId,
            missionStart: slot.missionStart,
            object: {
              objectId: obj.objectId,
              objectTitle: obj.objectTitle,
              objectType: obj.objectType,
              objectRA: obj.objectRA,
              objectDec: obj.objectDec,
              objectIconURL: obj.objectIconURL,
            },
          }),
        })
        const json = await res.json()
        setRecs((prev) => ({
          ...prev,
          [t.teleUniqueId]: {
            ...prev[t.teleUniqueId],
            data: rec,
            reserveBusy: false,
            message: json.error
              ? null
              : `Reserved ${obj.objectTitle ?? "mission"} ${formatDate(slot.missionStart)} ${formatTime(slot.missionStart)}`,
            error: json.error ? json.error : prev[t.teleUniqueId]?.error ?? null,
          },
        }))
        if (!json.error) {
          fetchMissions()
          fetchLimits()
          fetchSlots()
        }
      } catch (e) {
        setRecs((prev) => ({
          ...prev,
          [t.teleUniqueId]: { ...prev[t.teleUniqueId], reserveBusy: false, error: e instanceof Error ? e.message : "reservation failed" },
        }))
      }
    },
    [fetchMissions, fetchLimits, fetchSlots],
  )

  useEffect(() => {
    if (!active) return
    for (const t of telescopes) {
      const m = data[t.teleUniqueId]
      const objectId = m?.current?.astroObjectID
      if (objectId && !recs[t.teleUniqueId]?.data && !recs[t.teleUniqueId]?.busy) {
        fetchRecommend(t.teleUniqueId, objectId)
      }
    }
  }, [active, data, recs, telescopes, fetchRecommend])

  const nowSec = Math.floor(now / 1000)
  const canReserve = limits?.allowMissionReservation ?? false
  const canReserveAdvanced =
    (limits?.allowAdvancedMissionReservation ?? false) &&
    (limits?.advancedMissionQuota.availableCount ?? 0) > 0

  const isAdvancedSlot = (s: { missionType: string | null }) =>
    (s.missionType || "").toLowerCase() === "advanced"
  const isMemberSlot = (s: { missionType: string | null }) =>
    (s.missionType || "").toLowerCase() === "member" || !s.missionType
  const slotReservable = (s: { missionType: string | null }) =>
    isAdvancedSlot(s) ? canReserveAdvanced : (isMemberSlot(s) ? canReserve : false)

  return (
    <div className={cn("min-h-0 flex-1 flex-col", active ? "flex" : "hidden")}>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {error ? (
          <p className="border border-red-900/60 bg-red-950/30 px-2 py-1.5 text-[10px] leading-relaxed text-red-300">
            failed to load missions ({error}). Start the server with{" "}
            <code className="text-red-200">pnpm dev:server</code>.
          </p>
        ) : null}
        {limits ? (
          <div className="mb-3 border border-border bg-card">
            <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5">
              <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                Mission Limits
              </span>
              <span
                className={cn(
                  "font-mono text-[10px] tabular-nums",
                  limits.missionQuota.availableCount > 0
                    ? "text-emerald-300"
                    : "text-amber-300",
                )}
              >
                {limits.missionsQuotaMsg ?? "—"}
              </span>
            </div>
            <div className="flex flex-col gap-1.5 px-2.5 py-2">
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                {limits.missionsLimitMsg ?? "no mission limit info"}
              </p>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] tracking-wider text-muted-foreground uppercase">
                  advanced missions
                </p>
                <span
                  className={cn(
                    "shrink-0 font-mono text-[10px] tabular-nums",
                    (limits.advancedMissionQuota.availableCount ?? 0) > 0
                      ? "text-emerald-300"
                      : "text-amber-300",
                  )}
                >
                  {limits.advancedMissionsQuotaMsg ?? "0/0"}
                </span>
              </div>
            </div>
          </div>
        ) : null}
        {limits ? (
          <div className="mb-3 border border-border bg-card">
            <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5">
              <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                Plan a Mission
              </span>
            </div>
            <div className="flex flex-col gap-1.5 px-2.5 py-2">
              {planner.message ? (
                <p className="text-[10px] leading-relaxed text-emerald-300">{planner.message}</p>
              ) : null}
              {planner.error ? (
                <p className="text-[10px] leading-relaxed text-red-300">{planner.error}</p>
              ) : null}
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={planner.q}
                  onChange={(e) => setPlanner((p) => ({ ...p, q: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") searchObjects(planner.teleUniqueId ?? "", planner.q) }}
                  placeholder="Search Slooh 1000 objects…"
                  className="min-w-0 flex-1 border border-border bg-card px-1.5 py-1 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => searchObjects(planner.teleUniqueId ?? "", planner.q)}
                  disabled={planner.searching || !planner.q.trim()}
                  className="flex items-center gap-1 border border-border bg-card px-1.5 py-1 text-[9px] tracking-wider text-muted-foreground uppercase transition-colors hover:border-primary hover:text-foreground disabled:cursor-default disabled:opacity-50"
                >
                  {planner.searching ? (
                    <RefreshCw className="size-3 animate-spin" />
                  ) : (
                    <Search className="size-3" />
                  )}
                </button>
              </div>
              {planner.results.length > 0 ? (
                <ul className="flex max-h-28 flex-col overflow-y-auto">
                  {planner.results.map((o) => (
                    <li key={o.objectId}>
                      <button
                        type="button"
                        onClick={() => setPlanner((p) => ({ ...p, selected: o, error: null }))}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 border-t border-border/60 px-1 py-1 text-left text-[10px] transition-colors hover:text-foreground",
                          planner.selected?.objectId === o.objectId ? "bg-primary/10 text-foreground" : "text-muted-foreground",
                        )}
                      >
                        <span className="truncate">{o.objectTitle}</span>
                        <span className="shrink-0 font-mono text-[9px] tabular-nums text-muted-foreground/60">
                          {o.objectConstellation ?? o.objectType ?? ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {planner.selected ? (
                <div className="flex flex-col gap-1">
                  {canReserveAdvanced ? (
                    <>
                      <select
                        value={planner.teleUniqueId ?? ""}
                        onChange={(e) => setPlanner((p) => ({ ...p, teleUniqueId: e.target.value, slot: null }))}
                        className="border border-border bg-card px-1.5 py-1 text-[10px] text-foreground outline-none focus:border-primary"
                      >
                        <option value="">Select telescope</option>
                        {telescopes
                          .filter((t) => {
                            const s = slots[t.teleUniqueId] ?? []
                            return s.some((sl) => slotReservable(sl))
                          })
                          .map((t) => (
                            <option key={t.teleUniqueId} value={t.teleUniqueId}>
                              {t.telescopeName} ({t.obsName})
                            </option>
                          ))}
                      </select>
                      {planner.teleUniqueId ? (
                        <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
                          {(slots[planner.teleUniqueId] ?? [])
                            .filter((s) => s.missionStart != null && s.missionStart > nowSec - 30)
                            .map((s) => {
                              const reservable = slotReservable(s)
                              const active = planner.slot?.scheduledMissionId === s.scheduledMissionId
                              return (
                                <button
                                  key={s.scheduledMissionId}
                                  type="button"
                                  disabled={!reservable}
                                  onClick={() =>
                                    reservable &&
                                    setPlanner((p) => ({ ...p, slot: s, error: null }))
                                  }
                                  title={
                                    reservable
                                      ? isAdvancedSlot(s)
                                        ? "Select this advanced slot"
                                        : "Select this slot"
                                      : isAdvancedSlot(s)
                                        ? "advanced missions need a paid plan (0 available)"
                                        : "no missions available"
                                  }
                                  className={cn(
                                    "flex min-w-0 items-center gap-1.5 text-left p-1",
                                    reservable ? "text-foreground hover:bg-primary/10" : "cursor-default text-muted-foreground/50",
                                    active && "bg-primary/20 text-primary",
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "size-2 shrink-0 rounded-full border",
                                      active ? "border-primary bg-primary" : "border-border",
                                    )}
                                  />
                                  <span className="font-mono text-[10px] tabular-nums">
                                    {formatDate(s.missionStart!)} {formatTime(s.missionStart!)}
                                    {s.durationSec ? ` · ${Math.round(s.durationSec / 60)}m` : ""}
                                  </span>
                                  {isAdvancedSlot(s) ? (
                                    <span className="shrink-0 text-[9px] tracking-wider text-amber-300/80 uppercase">
                                      ★ adv
                                    </span>
                                  ) : null}
                                </button>
                              )
                            })}
                        </div>
                      ) : null}
                    </>
) : (
                    <>
                      {(() => {
                        const allReservable = telescopes.flatMap((t) =>
                          (slots[t.teleUniqueId] ?? [])
                            .filter((s) => s.missionStart != null && s.missionStart > nowSec - 30)
                            .filter(slotReservable)
                            .map((s) => ({ t, s }))
                        )
                        const autoSlot = allReservable[0]
                        if (!autoSlot) {
                          return <p className="text-[9px] leading-relaxed text-amber-300/90">no reservable slots on this plan right now</p>
                        }
                        return null
                      })()}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const t = planner.teleUniqueId
                        ? telescopes.find((x) => x.teleUniqueId === planner.teleUniqueId)
                        : (() => {
                            const allReservable = telescopes.flatMap((tt) =>
                              (slots[tt.teleUniqueId] ?? [])
                                .filter((s) => s.missionStart != null && s.missionStart > nowSec - 30)
                                .filter(slotReservable)
                                .map((s) => ({ t: tt, s }))
                            )
                            return allReservable[0]?.t
                          })()
                      const slot = planner.slot ?? (() => {
                        if (planner.teleUniqueId) {
                          return (slots[planner.teleUniqueId] ?? []).filter((s) => s.missionStart != null && s.missionStart > nowSec - 30).find(slotReservable) ?? null
                        }
                        const allReservable = telescopes.flatMap((tt) =>
                          (slots[tt.teleUniqueId] ?? [])
                            .filter((s) => s.missionStart != null && s.missionStart > nowSec - 30)
                            .filter(slotReservable)
                            .map((s) => ({ t: tt, s }))
                        )
                        return allReservable[0]?.s ?? null
                      })()
                      if (t && slot) reserve(t, slot, planner.selected!)
                    }}
                    disabled={planner.reserving || !planner.selected || !planner.slot && !canReserveAdvanced && telescopes.flatMap(t => (slots[t.teleUniqueId] ?? []).filter(s => s.missionStart != null && s.missionStart > nowSec - 30).filter(slotReservable)).length === 0}
                    title={
                      planner.selected
                        ? `Reserve with ${planner.selected.objectTitle}`
                        : "select an object first"
                    }
                    className="border border-emerald-900/60 bg-emerald-950/40 px-1.5 py-1 text-[10px] tracking-wider text-emerald-200 uppercase transition-colors hover:border-emerald-400 hover:text-emerald-100 disabled:cursor-default disabled:opacity-60"
                  >
                    {planner.reserving ? "Reserving…" : "Reserve Mission"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {!error && telescopes.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] leading-relaxed text-muted-foreground">
            Select telescopes in the Telescopes tab to see their current and
            upcoming missions.
          </p>
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
                <span className="text-[9px] tracking-wider text-muted-foreground uppercase">
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
                {(() => {
                  const rec = recs[t.teleUniqueId]
                  if (!rec || (!rec.data && !rec.error)) return null
                  const slot = rec.data?.slot
                  const obj = rec.data?.object
                  const recReservable = slot
                    ? isAdvancedSlot(slot)
                      ? canReserveAdvanced
                      : canReserve
                    : false
                  return (
                    <div className="flex flex-col gap-1.5 border-t border-border/60 pt-1.5">
                      <p className="flex items-center gap-1.5 text-[10px] tracking-wider text-muted-foreground uppercase">
                        <Sparkles className="size-3" />
                        recommended slot
                        {obj ? <span className="truncate text-muted-foreground/70 normal-case">
                          · {obj.objectTitle}
                        </span> : null}
                      </p>
                      {rec.busy ? (
                        <p className="text-[10px] text-muted-foreground">searching…</p>
                      ) : rec.error ? (
                        <p className="text-[10px] leading-relaxed text-muted-foreground">
                          {rec.error}
                        </p>
                      ) : slot && obj ? (
                        <>
                          <div className="flex items-center justify-between gap-2 text-[10px]">
                            <span className="min-w-0 truncate text-muted-foreground">
                              {slot.telescopeName ?? "telescope"}
                              {slot.obsName ? ` · ${slot.obsName}` : ""}
                            </span>
                            <span className="shrink-0 font-mono text-[10px] tabular-nums text-foreground">
                              {formatDate(slot.missionStart)} {formatTime(slot.missionStart)}
                            </span>
                          </div>
                          {rec.message ? (
                            <p className="text-[10px] leading-relaxed text-emerald-300">{rec.message}</p>
                          ) : null}
                          {rec.error ? (
                            <p className="text-[10px] leading-relaxed text-red-300">{rec.error}</p>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => reserveRecommend(t, rec.data!)}
                            disabled={!recReservable || rec.reserveBusy}
                            title={
                              recReservable
                                ? "Reserve the best slot for this object"
                                : isAdvancedSlot(slot)
                                  ? "advanced missions require a paid plan (0 available on your plan)"
                                  : "no missions available for this account"
                            }
                            className="flex h-7 items-center justify-center gap-1.5 border border-emerald-900/60 bg-emerald-950/40 text-[9px] tracking-wider text-emerald-200 uppercase transition-colors hover:border-emerald-400 hover:text-emerald-100 disabled:cursor-default disabled:opacity-50"
                          >
                            {rec.reserveBusy
                              ? "Reserving…"
                              : isAdvancedSlot(slot)
                                ? "Reserve best slot ★"
                                : "Reserve best slot"}
                          </button>
                          {!recReservable && slot ? (
                            <p className="text-[10px] leading-relaxed text-amber-300/90">
                              {isAdvancedSlot(slot)
                                ? "advanced slot — your plan allows 0 simultaneous advanced reservations"
                                : "reservation not available on this account"}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p className="text-[10px] text-muted-foreground">
                          no available slot for this object right now
                        </p>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          )
        })}
      </div>
      {!error && telescopes.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            fetchMissions()
            fetchLimits()
            fetchSlots()
          }}
          disabled={loading}
          className="mt-1 flex h-8 w-full items-center justify-center gap-1.5 border border-border bg-card text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:cursor-default disabled:opacity-60 disabled:hover:border-border disabled:hover:text-muted-foreground"
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      ) : null}
    </div>
  )
}
