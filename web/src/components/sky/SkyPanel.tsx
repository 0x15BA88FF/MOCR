import { Moon, Radio } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePolling } from "@/lib/usePolling"
import type { SloohTelescope } from "@/lib/slooh"
import type { SloohSky } from "@/lib/slooh"

function WidgetImage({ url, label, note }: { url: string | null; label: string; note?: string }) {
  return (
    <div className="flex min-h-0 flex-col gap-0.5">
      <p className="text-[9px] tracking-wider text-muted-foreground uppercase">
        {label}
        {note ? <span className="ml-1 normal-case text-muted-foreground/60">· {note}</span> : null}
      </p>
      {url ? (
        <img
          src={url}
          alt={label}
          className="max-h-40 w-full border border-border/60 bg-background object-contain"
          loading="lazy"
        />
      ) : (
        <p className="border border-dashed border-border/60 px-1.5 py-1 text-[9px] text-muted-foreground/60">
          unavailable for this observatory
        </p>
      )}
    </div>
  )
}

function SkyCard({ obsId, active }: { obsId: string; active: boolean }) {
  const { data, error } = usePolling<SloohSky>(
    `/api/sky?obsId=${encodeURIComponent(obsId)}`,
    { enabled: active, intervalMs: 120_000 },
  )
  const w = data?.widgets
  const observedAt = w?.seeing?.observedAt ?? null
  if (error && !data) {
    return (
      <div className="border border-red-900/60 bg-red-950/30 px-2.5 py-2">
        <p className="text-[10px] tracking-wider text-muted-foreground uppercase">{obsId}</p>
        <p className="mt-1 text-[10px] leading-relaxed text-red-300">
          failed to load sky conditions ({error}) — the server may be starting up or
          needs a restart.
        </p>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="border border-border bg-card px-2.5 py-2">
        <p className="text-[10px] tracking-wider text-muted-foreground uppercase">
          {obsId}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">loading sky conditions…</p>
      </div>
    )
  }
  return (
    <div className="border border-border bg-card px-2.5 py-2">
      <p className="flex items-center justify-between gap-2 text-[10px] tracking-wider text-muted-foreground uppercase">
        {data.obsName}
        <span className="flex items-center gap-1 font-mono text-[8px] normal-case">
          <span
            className={cn(
              "size-1.5 rounded-full",
              w?.seeing?.online ? "bg-emerald-400" : "bg-muted-foreground/40",
            )}
          />
          {w?.seeing?.online ? "online" : "offline"}
          {observedAt
            ? ` · ${new Date(observedAt).toISOString().slice(11, 16)} UTC`
            : ""}
        </span>
      </p>
      <div className="mt-1.5 flex flex-col gap-3">
        {w?.seeing ? (
          <p className="font-mono text-[11px] text-foreground tabular-nums">
            Seeing index {w.seeing.index ?? "—"}
            {w.seeing.description ? (
              <span className="ml-1 text-[10px] text-muted-foreground">
                · {w.seeing.description}
              </span>
            ) : null}
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          <WidgetImage url={w?.allSkyCamera?.url ?? null} label="All-sky cam" note="full sky view" />
          <WidgetImage url={w?.domeCamera?.url ?? null} label="Dome cam" note="inside the dome" />
        </div>
        <WidgetImage
          url={w?.facilityWebcam?.url ?? null}
          label={`Webcam ${w?.facilityWebcam?.title ?? ""}`}
          note="observatory grounds"
        />
        <WidgetImage url={w?.dayNightBar?.url ?? null} label="Day / night" note="tonight's observing window" />
        {w?.dayNightBar?.raw ? (
          <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5 border-t border-border/60 pt-1.5">
            {(
              [
                ["current", w.dayNightBar.raw.currenTimeFormatted],
                ["sunset", w.dayNightBar.raw.sunsetTime],
                ["sunrise", w.dayNightBar.raw.sunriseTime],
                ["domes open", w.dayNightBar.raw.domesOpenTime],
                ["missions", w.dayNightBar.raw.missionStartTime],
                ["missions end", w.dayNightBar.raw.missionEndTime],
                ["twilight start", w.dayNightBar.raw.astroTwilightStartTime],
                ["twilight end", w.dayNightBar.raw.astroTwilightEndTime],
              ] as const
            ).map(([k, v]) => (
              <li key={k} className="flex items-baseline justify-between gap-1 text-[9px]">
                <span className="tracking-wider text-muted-foreground uppercase">{k}</span>
                <span className="truncate font-mono text-[9px] text-foreground tabular-nums">{v}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <WidgetImage url={w?.dayNightMap?.url ?? null} label="Day / night map" note="darkness zones worldwide" />
        {w?.missionControl ? (
          <div className="flex flex-col gap-1 border-t border-border/60 pt-1.5">
            <p className="flex items-center gap-1 text-[9px] tracking-wider text-muted-foreground uppercase">
              <Radio className="size-3" />
              mission control
              <span className="text-muted-foreground/60">· observatory status bulletin</span>
            </p>
            <p className="text-[10px] leading-snug text-muted-foreground">
              {w.missionControl.title}
            </p>
            {w.missionControl.contentText ? (
              <p className="text-[10px] leading-snug whitespace-pre-line text-foreground">
                {w.missionControl.contentText}
              </p>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p className="border-t border-border/60 pt-1 text-[9px] leading-relaxed text-amber-300">
            refresh failed ({error}) — showing last data
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function SkyPanel({
  active,
  telescopes,
}: {
  active: boolean
  telescopes: SloohTelescope[]
}) {
  const { data: events } = usePolling<{
    eventCount: number
    events: {
      eventId: number | null
      title: string | null
      dateText: string | null
      description: string | null
      linkUrl: string | null
    }[]
  }>("/api/events/upcoming", { enabled: active, intervalMs: 300_000 })
  const { data: livecast } = usePolling<{
    isLive: boolean
    displayTitle: string | null
    upcomingShows: { title: string | null; dateText: string | null; linkUrl: string | null }[]
  }>("/api/livecast", { enabled: active, intervalMs: 90_000 })
  const obsIds = [...new Set(telescopes.map((t) => t.obsId).filter(Boolean))]

  return (
    <div className={cn("min-h-0 flex-1 flex-col", active ? "flex" : "hidden")}>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {obsIds.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] leading-relaxed text-muted-foreground">
            Select telescopes in the Telescopes tab to see their sky conditions.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {obsIds.map((obsId) => (
              <SkyCard key={obsId} obsId={obsId} active={active} />
            ))}
          </div>
        )}
        <div className="mt-3 border border-border bg-card px-2.5 py-2">
          <p className="flex items-center gap-1.5 text-[10px] tracking-wider text-muted-foreground uppercase">
            <Radio className="size-3" />
            Live audio show
          </p>
          <p className="mt-1 flex items-center gap-2 text-[10px] leading-snug text-muted-foreground">
            <span className="min-w-0 flex-1">{livecast?.displayTitle ?? "loading…"}</span>
          </p>
          {livecast?.upcomingShows && livecast.upcomingShows.length > 0 ? (
            <ul className="mt-1.5 flex flex-col gap-0.5 border-t border-border/60 pt-1.5">
              {livecast.upcomingShows.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="truncate text-muted-foreground">{s.title}</span>
                  <span className="shrink-0 font-mono text-[9px] text-muted-foreground/70 tabular-nums">
                    {s.dateText}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="mt-3 border border-border bg-card px-2.5 py-2">
          <p className="flex items-center gap-1.5 text-[10px] tracking-wider text-muted-foreground uppercase">
            <Moon className="size-3" />
            Upcoming events
          </p>
          {events ? (
            events.events.length === 0 ? (
              <p className="mt-1 text-[10px] text-muted-foreground">
                no events scheduled right now
              </p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1.5">
                {events.events.map((e) => (
                  <li key={e.eventId ?? 0} className="flex flex-col gap-0.5 border-t border-border/60 pt-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] font-medium text-foreground">{e.title}</span>
                      <span className="shrink-0 font-mono text-[9px] text-muted-foreground tabular-nums">
                        {e.dateText}
                      </span>
                    </div>
                    {e.description ? (
                      <p className="line-clamp-2 text-[9px] leading-snug text-muted-foreground">
                        {e.description}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      </div>
    </div>
  )
}
