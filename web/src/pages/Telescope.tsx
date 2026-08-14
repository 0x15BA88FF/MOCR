import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react"
import {
  CalendarClock,
  Camera,
  Eye,
  EyeOff,
  GripVertical,
  Images,
  Info,
  Loader2,
  Maximize,
  Minimize,
  RotateCw,
  Rows3,
  Satellite,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import MissionsPanel from "@/components/MissionsPanel"
import PhotosPanel from "@/components/PhotosPanel"
import { ObjectInfoPopover } from "@/components/ObjectInfoPopover"
import { buildGridTiling, type TilingNode } from "@/lib/tiling"
import { cn } from "@/lib/utils"
import type { SloohObject, SloohTelescope } from "@/lib/slooh"

export type { SloohObject, SloohTelescope } from "@/lib/slooh"

interface FrameMeta {
  url: string
  imageID?: string
  astroObjectID?: string
  scheduledMissionID?: string
  missionTitle?: string | null
}

interface MissionMeta {
  imageID?: string | null
  astroObjectID?: string | null
  scheduledMissionID?: string | null
  missionTitle?: string | null
  serverTime?: number | null
}

function swap(array: readonly string[], a: string, b: string): string[] {
  const next = [...array]
  const i = next.indexOf(a)
  const j = next.indexOf(b)
  if (i === -1 || j === -1) return next
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

const subtreeKey = (node: TilingNode): string =>
  node.kind === "leaf" ? node.id : node.children.map(subtreeKey).join("|")

const clampInt = (value: number, min: number, max: number): number =>
  Number.isNaN(value) ? min : Math.min(max, Math.max(min, Math.round(value)))

const fadeMs = 700

function youtubeVideoId(urlOrId: string | null): string | null {
  if (!urlOrId) return null
  const s = urlOrId.trim()
  if (/^[\w-]{11}$/.test(s)) return s
  const m = s.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/,
  )
  return m ? m[1] : null
}

function youtubeEmbedUrl(
  telescope: Pick<SloohTelescope, "streamCode" | "streamURL">,
): string | null {
  const id = youtubeVideoId(telescope.streamURL) || telescope.streamCode
  if (!id) return null
  return `https://www.youtube.com/embed/${id}?rel=0&autoplay=1&modestbranding=1&controls=0&showinfo=0&origin=${encodeURIComponent(window.location.origin)}`
}

const pad2 = (n: number): string => String(Math.max(0, Math.floor(n))).padStart(2, "0")

const hasCoords = (o: SloohObject | null): o is SloohObject & { ra: number; dec: number } =>
  o != null && o.ra != null && o.dec != null && (o.ra !== 0 || o.dec !== 0)

function formatHms(ra: number): string {
  const h = Math.floor(ra)
  const m = Math.floor((ra - h) * 60)
  return `${pad2(h)}h ${pad2(m)}m`
}

function formatDms(dec: number): string {
  const sign = dec < 0 ? "−" : "+"
  const a = Math.abs(dec)
  const d = Math.floor(a)
  const m = Math.floor((a - d) * 60)
  return `${sign}${pad2(d)}° ${pad2(m)}′`
}

function formatArcmin(sizeArcSeconds: number | null): string | null {
  if (sizeArcSeconds == null) return null
  return `${(sizeArcSeconds / 60).toFixed(1).replace(/\.0$/, "")}′`
}

function compassDir(azimuth: number): string {
  const dirs = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ]
  return dirs[Math.round(((azimuth % 360) / 22.5)) % 16]
}

function formatAltAz(altAz: SloohObject["altAz"]): string | null {
  if (!altAz) return null
  return `alt ${altAz.altitude.toFixed(1)}° az ${altAz.azimuth.toFixed(1)}° (${compassDir(altAz.azimuth)})`
}

function SseImage({ src, alt }: { src: string; alt: string }) {
  const [newest, setNewest] = useState(src)
  const [outgoing, setOutgoing] = useState<string | null>(null)
  const [fading, setFading] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (src === newest) return
    setOutgoing(newest)
    setNewest(src)
    setFailed(false)
  }, [src, newest])

  useEffect(() => {
    setFading(false)
    const raf = requestAnimationFrame(() => setFading(true))
    return () => cancelAnimationFrame(raf)
  }, [newest])

  useEffect(() => {
    if (!outgoing) return
    const timer = setTimeout(() => setOutgoing(null), fadeMs + 100)
    return () => clearTimeout(timer)
  }, [outgoing])

  if (failed) {
    return (
      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
        <span className="text-xs tracking-widest text-white/40 uppercase">
          feed unavailable
        </span>
      </div>
    )
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {outgoing && (
        <img
          src={outgoing}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      <img
        src={newest}
        alt={alt}
        draggable={false}
        onLoad={() => setFading(true)}
        onError={() => setFailed(true)}
        className={cn(
          "absolute inset-0 size-full object-cover transition-opacity duration-[700ms] ease-in-out",
          fading ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  )
}

function FrameContent({
  telescope,
  currentImgURL,
  refreshKey = 0,
}: {
  telescope: SloohTelescope | null
  currentImgURL: string | null
  refreshKey?: number
}) {
  if (!telescope) {
    return (
      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
        <span className="text-xs tracking-widest text-white/25 uppercase">
          pick a telescope
        </span>
      </div>
    )
  }
  if (!telescope.online) {
    return (
      <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center gap-1 bg-black/40">
        <span className="text-sm font-semibold text-white/80">
          {telescope.telescopeName}
        </span>
        <span className="text-[10px] tracking-widest text-red-300 uppercase">
          offline
        </span>
      </div>
    )
  }
  if (telescope.feedType === "video") {
    const src = youtubeEmbedUrl(telescope)
    if (!src) {
      return (
        <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
          <span className="text-xs tracking-widest text-white/40 uppercase">
            video feed unavailable
          </span>
        </div>
      )
    }
    return (
      <iframe
        src={src}
        title={telescope.telescopeName}
        className="absolute inset-0 z-0 size-full border-0"
        allow="autoplay; fullscreen"
      />
    )
  }
  if (currentImgURL) {
    const freshURL =
      currentImgURL +
      (currentImgURL.includes("?") ? "&" : "?") +
      "_r=" +
      refreshKey
    return <SseImage src={freshURL} alt={telescope.telescopeName} />
  }
  return (
    <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
      <span className="animate-pulse text-xs tracking-widest text-white/40 uppercase">
        waiting for feed…
      </span>
    </div>
  )
}

interface FrameAction {
  icon: LucideIcon
  label: string
  onClick?: () => void
  onPointerDown?: (e: PointerEvent<HTMLButtonElement>) => void
  className?: string
}

interface FrameProps {
  id: string
  telescope: SloohTelescope | null
  currentImgURL: string | null
  mission: MissionMeta | null
  object: SloohObject | null
  dragging: boolean
  highlighted: boolean
  focused: boolean
  showHud: boolean
  infoOpen: boolean
  refreshKey?: number
  audioState: "muted" | "waiting" | "playing"
  onToggleAudio: () => void
  onRefresh: () => void
  onToggleInfo: () => void
  onToggleFocus: () => void
  onCaptured?: (customerImageId: number | null) => void
  onPointerDown: (e: PointerEvent<HTMLElement>, id: string) => void
  onPointerMove: (e: PointerEvent<HTMLDivElement>) => void
  onPointerUp: () => void
  onPointerCancel: () => void
}

function Frame({
  id,
  telescope,
  currentImgURL,
  mission,
  object,
  dragging,
  highlighted: _highlighted,
  focused,
  showHud,
  infoOpen,
  refreshKey = 0,
  audioState,
  onToggleAudio,
  onRefresh,
  onToggleInfo,
  onToggleFocus,
  onCaptured,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: FrameProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const focusOverlayRef = useRef<HTMLDivElement>(null)
  const [focusRadius, setFocusRadius] = useState(96)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const onFullscreenChange = () =>
      setIsFullscreen(document.fullscreenElement === frameRef.current)
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  useEffect(() => {
    const el = focusOverlayRef.current
    if (!el) return
    const update = () => {
      const { width, height } = el.getBoundingClientRect()
      setFocusRadius((Math.min(width, height) / 4) * 1.2)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [focused])

  const toggleFullscreen = () => {
    const el = frameRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      el.requestFullscreen().catch(() =>
        toast.error("Fullscreen failed", {
          description: "The browser refused to enter fullscreen.",
        }),
      )
    }
  }

  const handleCapture = async () => {
    const label = telescope?.telescopeName ?? id
    if (!telescope || !currentImgURL) {
      console.warn("[capture] aborted: no telescope/frame", { id, currentImgURL })
      toast.error("Nothing to capture", {
        description: `${label} has no still frame yet.`,
      })
      return
    }
    console.info("[capture] start", {
      teleUniqueId: telescope.teleUniqueId,
      telescopeId: telescope.telescopeId,
      frame: currentImgURL,
    })
    try {
      const res = await fetch("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teleUniqueId: telescope.teleUniqueId,
          telescopeId: telescope.telescopeId,
        }),
      })
      const raw = await res.text().catch(() => "")
      console.info("[capture] response", { status: res.status, body: raw })
      if (!res.ok) {
        const data = (JSON.parse(raw) ?? null) as { error?: string } | null
        throw new Error(data?.error ?? `HTTP ${res.status}`)
      }
      const data = JSON.parse(raw) as {
        slooh: {
          imagesAdded: number
          explanation: string | null
          customerImageId: number | null
          duplicate?: boolean
        }
      }
      console.info("[capture] result", data)
      const viewButton = (customerImageId: number | null) => (
        <button
          type="button"
          onClick={() => onCaptured?.(customerImageId)}
          className="text-sky-300 underline"
        >
          View it in your photos
        </button>
      )
      if (data.slooh.duplicate) {
        toast.info("Already in your photos", {
          description: (
            <>
              {data.slooh.explanation ?? "This image is already in your photos."}{" "}
              {viewButton(data.slooh.customerImageId)}
            </>
          ),
        })
      } else if (data.slooh.imagesAdded > 0) {
        const customerImageId = data.slooh.customerImageId
        toast.success("Saved to your Slooh account", {
          description: viewButton(customerImageId),
        })
      } else {
        toast.error("Capture failed", {
          description: data.slooh.explanation ?? "no frame available",
        })
      }
    } catch (e) {
      console.error("[capture] failed", e)
      toast.error("Capture failed", {
        description: e instanceof Error ? e.message : "request failed",
      })
    }
   }

   const hudText = useMemo(() => {
    if (!object) return null
    const parts: string[] = []
    if (hasCoords(object)) {
      parts.push(`${formatHms(object.ra)} ${formatDms(object.dec)}`)
    }
    const arcmin = formatArcmin(object.sizeArcSeconds)
    if (arcmin) parts.push(arcmin)
    const altAz = formatAltAz(object.altAz)
    if (altAz) parts.push(altAz)
    if (mission?.serverTime != null) {
      const age = Math.floor(Date.now() / 1000 - mission.serverTime)
      parts.push(age < 60 ? `${age}s ago` : age < 3600 ? `${Math.floor(age / 60)}m ago` : `${Math.floor(age / 3600)}h ago`)
    }
    return parts.length > 0 ? parts.join(" · ") : null
  }, [object, mission])

  const actions: FrameAction[] = [
    {
      icon: GripVertical,
      label: "Drag",
      onPointerDown: (e) => {
        e.stopPropagation()
        onPointerDown(e, id)
      },
    },
    {
      icon:
        audioState === "playing"
          ? Volume2
          : audioState === "waiting"
            ? Loader2
            : VolumeX,
      label:
        audioState === "playing"
          ? "Mute audio"
          : audioState === "waiting"
            ? "Waiting for audio..."
            : "Play audio",
      onClick: onToggleAudio,
    },
    {
      icon: Info,
      label: infoOpen ? "Close object info" : "Object info",
      onClick: onToggleInfo,
    },
    {
      icon: RotateCw,
      label: "Refresh frame",
      onClick: onRefresh,
    },
    { icon: Camera, label: "Take picture", onClick: handleCapture },
    {
      icon: isFullscreen ? Minimize : Maximize,
      label: isFullscreen ? "Exit fullscreen" : "Fullscreen",
      onClick: toggleFullscreen,
    },
    {
      icon: focused ? EyeOff : Eye,
      label: focused ? "Unfocus" : "Focus",
      onClick: onToggleFocus,
    },
  ]

  return (
    <div
      ref={frameRef}
      data-frame-id={id}
      onPointerDown={(e) => onPointerDown(e, id)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={cn(
        "group relative min-h-0 min-w-0 flex-1 cursor-grab touch-none select-none border-2 transition-opacity active:cursor-grabbing",
        dragging && "opacity-40",
        audioState === "playing"
          ? "border-emerald-500 ring-2 ring-emerald-500/50"
          : audioState === "waiting"
            ? "border-amber-500 ring-2 ring-amber-500/50"
            : "border-primary ring-1 ring-primary",
      )}
    >
      <FrameContent
        telescope={telescope}
        currentImgURL={currentImgURL}
        refreshKey={refreshKey}
      />
      {focused && (
        <div
          ref={focusOverlayRef}
          className="pointer-events-none absolute inset-0 z-0 bg-background"
          style={{
            WebkitMaskImage: `radial-gradient(circle ${focusRadius}px at 50% 50%, transparent 0, transparent ${focusRadius}px, #000 ${focusRadius + 1}px)`,
            maskImage: `radial-gradient(circle ${focusRadius}px at 50% 50%, transparent 0, transparent ${focusRadius}px, #000 ${focusRadius + 1}px)`,
          }}
        >
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 border-2 border-primary"
            style={{
              width: focusRadius * 2,
              height: focusRadius * 2,
              left: "50%",
              top: "50%",
              borderRadius: "9999px",
            }}
          />
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-1.5 top-1.5 z-10 flex justify-end gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <button
              key={action.label}
              type="button"
              aria-label={action.label}
              onPointerDown={(e) =>
                action.onPointerDown ? action.onPointerDown(e) : e.stopPropagation()
              }
              onClick={action.onClick}
              className={cn(
                "pointer-events-auto flex size-7 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:text-foreground",
                action.onPointerDown
                  ? "cursor-grab active:cursor-grabbing"
                  : "cursor-pointer",
              )}
            >
              <Icon className={cn("size-4", Icon === Loader2 && "animate-spin")} />
            </button>
          )
        })}
      </div>
      {telescope ? (
        <div
          className="pointer-events-none absolute bottom-1.5 left-1.5 z-10 max-w-[calc(100%-3rem)] border border-border/60 bg-black/70 px-1.5 py-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          title={telescope.telescopeName}
        >
          <span className="block truncate text-[10px] font-medium text-white/90">
            {telescope.telescopeName}
          </span>
          {mission &&
          (mission.missionTitle ||
            mission.astroObjectID ||
            mission.scheduledMissionID) ? (
            <span className="block truncate text-[9px] text-white/60">
              {mission.missionTitle ??
                object?.name ??
                mission.astroObjectID ??
                "—"}
              {mission.scheduledMissionID &&
              mission.scheduledMissionID !== "0" ? (
                <span className="opacity-70"> · mission {mission.scheduledMissionID}</span>
              ) : null}
            </span>
          ) : null}
          {showHud && hudText ? (
            <span className="block truncate font-mono text-[9px] text-sky-200/80">
              {hudText}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function TelescopeButton({
  t,
  selected,
  onToggle,
}: {
  t: SloohTelescope
  selected: boolean
  onToggle: (t: SloohTelescope) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(t)}
      aria-pressed={selected}
      title={t.telescopeName}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 border px-2 py-1.5 text-left transition-colors",
        selected
          ? "border-primary bg-primary/10 ring-1 ring-primary"
          : "border-border bg-card hover:border-primary/50",
      )}
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          t.online ? "bg-emerald-400" : "bg-red-400",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">
          {t.telescopeName}
        </span>
        <span className="block truncate text-[10px] text-muted-foreground">
          {t.obsName}
        </span>
      </span>
      <span className="shrink-0 text-[9px] tracking-wider text-muted-foreground uppercase">
        {t.feedType ?? t.status}
      </span>
    </button>
  )
}

function TelescopesSection({
  telescopes,
  selected,
  onToggle,
  error,
}: {
  telescopes: SloohTelescope[]
  selected: Set<string>
  onToggle: (t: SloohTelescope) => void
  error: string | null
}) {
  const online = telescopes.filter((t) => t.online)
  const offline = telescopes.filter((t) => !t.online)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          <Satellite className="size-3.5" />
          Telescopes
        </span>
        <span className="text-[10px] text-muted-foreground">
          {online.length}/{telescopes.length} online
        </span>
      </div>
      {error ? (
        <p className="border border-red-900/60 bg-red-950/30 px-2 py-1.5 text-[10px] leading-relaxed text-red-300">
          proxy unavailable ({error}). Start the server with{" "}
          <code className="text-red-200">pnpm dev:server</code>.
        </p>
      ) : null}
      {telescopes.length === 0 && !error ? (
        <p className="px-2 py-1.5 text-[10px] text-muted-foreground">
          loading telescopes…
        </p>
      ) : null}
      {online.map((t) => (
        <TelescopeButton
          key={t.teleUniqueId}
          t={t}
          selected={selected.has(t.teleUniqueId)}
          onToggle={onToggle}
        />
      ))}
      {offline.length > 0 ? (
        <span className="mt-1 text-[9px] tracking-widest text-muted-foreground/60 uppercase">
          offline
        </span>
      ) : null}
      {offline.map((t) => (
        <TelescopeButton
          key={t.teleUniqueId}
          t={t}
          selected={selected.has(t.teleUniqueId)}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}

function Telescope() {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("mocr_selected_ids")
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const [maxRows, setMaxRows] = useState<number>(() => {
    try {
      const raw = localStorage.getItem("mocr_max_rows")
      return raw ? Number(raw) : 2
    } catch {
      return 2
    }
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<
    "telescopes" | "photos" | "config" | "missions"
  >("telescopes")
  const [photosFocusKey, setPhotosFocusKey] = useState<number | null>(null)
  const [photosFocusImageId, setPhotosFocusImageId] = useState<number | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [infoId, setInfoId] = useState<string | null>(null)
  const [showHud, setShowHud] = useState(true)
  const [showChart, setShowChart] = useState(true)
  const [telescopes, setTelescopes] = useState<SloohTelescope[]>([])
  const [telescopeError, setTelescopeError] = useState<string | null>(null)
  const [latest, setLatest] = useState<Record<string, FrameMeta>>({})
  const [refreshKeys, setRefreshKeys] = useState<Record<string, number>>({})
  const [activeAudioTeleId, setActiveAudioTeleId] = useState<string | null>(null)
  const globalAudioRef = useRef<HTMLAudioElement | null>(null)
  const dragRef = useRef<{ id: string } | null>(null)

  const activeAudioTelescope = telescopes.find((t) => t.teleUniqueId === activeAudioTeleId)
  const activeAudioURL = activeAudioTelescope?.object?.audioURL ?? null

  useEffect(() => {
    const el = globalAudioRef.current
    if (!el) return
    if (!activeAudioTeleId) {
      el.pause()
      el.src = ""
      return
    }
    if (activeAudioURL) {
      if (el.src !== new URL(activeAudioURL, window.location.origin).href) {
        el.src = activeAudioURL
        el.play().catch(() => {})
      } else if (el.paused) {
        el.play().catch(() => {})
      }
    } else {
      el.pause()
      el.src = ""
    }
  }, [activeAudioTeleId, activeAudioURL])

  const toggleAudioFor = (teleUniqueId: string) => {
    setActiveAudioTeleId((cur) => (cur === teleUniqueId ? null : teleUniqueId))
  }

  useEffect(() => {
    try {
      localStorage.setItem("mocr_selected_ids", JSON.stringify(selectedIds))
    } catch {}
  }, [selectedIds])

  useEffect(() => {
    try {
      localStorage.setItem("mocr_max_rows", String(maxRows))
    } catch {}
  }, [maxRows])

  const telescopesById = useMemo(
    () => new Map(telescopes.map((t) => [t.teleUniqueId, t])),
    [telescopes],
  )

  const tree = useMemo(
    () => buildGridTiling(selectedIds, maxRows),
    [selectedIds, maxRows],
  )

  const loadTelescopes = useCallback(async () => {
    try {
      const res = await fetch("/api/telescopes")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setTelescopes(data.telescopes ?? [])
      setTelescopeError(null)
    } catch (e) {
      setTelescopeError(e instanceof Error ? e.message : "request failed")
    }
  }, [])

  useEffect(() => {
    loadTelescopes()
    const timer = setInterval(loadTelescopes, 15_000)
    return () => clearInterval(timer)
  }, [loadTelescopes])

  const handleRefreshFrame = (id: string) => {
    setRefreshKeys((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }))
    const label = telescopesById.get(id)?.telescopeName ?? id
    loadTelescopes().then(() => {
      toast.success("Frame refreshed", {
        description: `${label}: latest data and image reloaded.`,
      })
    })
  }

  useEffect(() => {
    const es = new EventSource("/api/events")
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          telescopeId?: string
          teleUniqueId?: string
          frame?: {
            currentImgURL?: string
            imageID?: string
            astroObjectID?: string
            scheduledMissionID?: string
          }
          missionTitle?: string | null
        }
        const id = payload.teleUniqueId ?? payload.telescopeId
        const frame = payload.frame
        const url = frame?.currentImgURL
        if (id && url) {
          setLatest((prev) => ({
            ...prev,
            [id]: {
              url,
              imageID: frame.imageID,
              astroObjectID: frame.astroObjectID,
              scheduledMissionID: frame.scheduledMissionID,
              missionTitle: payload.missionTitle ?? null,
            },
          }))
        }
      } catch {}
    }
    return () => es.close()
  }, [])

  useEffect(() => {
    if (!sidebarOpen) return
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [sidebarOpen])

  useEffect(() => {
    if (!infoId) return
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setInfoId(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [infoId])

  const handlePointerDown = (e: PointerEvent<HTMLElement>, id: string) => {
    if (e.button !== 0) return
    dragRef.current = { id }
    setDragId(id)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    const target = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>("[data-frame-id]")
    setOverId(target?.dataset.frameId ?? null)
  }

  const handlePointerUp = () => {
    const { id } = dragRef.current ?? {}
    dragRef.current = null
    if (id && overId && overId !== id) {
      setSelectedIds((prev) => swap(prev, id, overId))
    }
    setDragId(null)
    setOverId(null)
  }

  const handlePointerCancel = () => {
    dragRef.current = null
    setDragId(null)
    setOverId(null)
  }

  const toggleTelescope = (t: SloohTelescope) => {
    setSelectedIds((prev) => {
      const removing = prev.includes(t.teleUniqueId)
      if (removing && infoId === t.teleUniqueId) setInfoId(null)
      return removing
        ? prev.filter((id) => id !== t.teleUniqueId)
        : [...prev, t.teleUniqueId]
    })
  }

  const [focusedIds, setFocusedIds] = useState<Record<string, boolean>>({})
  const toggleFrameFocus = (id: string) =>
    setFocusedIds((prev) => ({ ...prev, [id]: !prev[id] }))

  const openPhotosTo = (customerImageId: number | null) => {
    setPhotosFocusKey(Date.now())
    setPhotosFocusImageId(customerImageId)
    setActiveTab("photos")
    setSidebarOpen(true)
  }

  const tabs: {
    id: "telescopes" | "photos" | "config" | "missions"
    label: string
    icon: LucideIcon
  }[] = [
    { id: "telescopes", label: "Telescopes", icon: Satellite },
    { id: "missions", label: "Missions", icon: CalendarClock },
    { id: "photos", label: "Photos", icon: Images },
    { id: "config", label: "Config", icon: Rows3 },
  ]

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const renderNode = (node: TilingNode): ReactNode => {
    if (node.kind === "leaf") {
      const telescope = telescopesById.get(node.id) ?? null
      const meta = telescope ? latest[telescope.teleUniqueId] : undefined
      const currentImgURL = telescope
        ? meta?.url ?? telescope.currentImgURL ?? null
        : null
      const mission = telescope ? (meta ?? telescope.mission) : null
      const object = telescope?.object ?? null
      const isAudioActive = activeAudioTeleId === telescope?.teleUniqueId
      const audioState: "muted" | "waiting" | "playing" = !isAudioActive
        ? "muted"
        : activeAudioURL
          ? "playing"
          : "waiting"
      return (
        <Frame
          key={node.id}
          id={node.id}
          telescope={telescope}
          currentImgURL={currentImgURL}
          mission={mission}
          object={object}
          dragging={dragId === node.id}
          highlighted={overId === node.id}
          focused={focusedIds[node.id] ?? false}
          showHud={showHud}
          infoOpen={infoId === node.id}
          refreshKey={refreshKeys[node.id] ?? 0}
          audioState={audioState}
          onToggleAudio={() =>
            telescope && toggleAudioFor(telescope.teleUniqueId)
          }
          onRefresh={() => handleRefreshFrame(node.id)}
          onToggleInfo={() =>
            setInfoId((cur) => (cur === node.id ? null : node.id))
          }
          onToggleFocus={() => toggleFrameFocus(node.id)}
          onCaptured={openPhotosTo}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        />
      )
    }

    return (
      <div
        key={`${node.direction}-${subtreeKey(node)}`}
        className="flex min-h-0 min-w-0 flex-1 gap-2"
        style={{ flexDirection: node.direction }}
      >
        {node.children.map(renderNode)}
      </div>
    )
  }

  const inputClassName =
    "h-8 w-full border border-input bg-transparent px-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"

  return (
    <>
      <audio ref={globalAudioRef} preload="auto" className="hidden" />
      <main className="flex h-dvh w-full touch-none select-none p-4">
        {tree ? (
          renderNode(tree)
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-sm text-muted-foreground">
              select telescopes from the sidebar to open their feeds
            </span>
          </div>
        )}
      </main>
      <button
        type="button"
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label="Toggle control sidebar"
        aria-expanded={sidebarOpen}
        className={cn(
          "fixed bottom-4 z-20 flex size-10 items-center justify-center border-2 border-sky-300 bg-primary text-primary-foreground shadow-lg shadow-primary/40 transition-[right] duration-200 ease-linear hover:bg-primary/90 active:bg-primary/80",
          sidebarOpen ? "right-[calc(20rem+1.5rem)]" : "right-4",
        )}
      >
        <SlidersHorizontal className="size-4.5" />
      </button>
      <aside
        aria-label="Control center"
        aria-hidden={!sidebarOpen}
        className={cn(
          "fixed top-4 right-4 bottom-4 z-10 flex w-90 flex-col border border-border bg-card shadow-2xl shadow-black/50 transition-transform duration-200 ease-linear",
          sidebarOpen ? "translate-x-0" : "translate-x-[calc(100%+1rem)]",
        )}
      >
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Control Center
          </span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close control sidebar"
            className="flex size-8 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1 px-3 pb-3">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-selected={activeTab === tab.id}
                className={cn(
                  "flex h-9 flex-1 basis-[calc(50%-0.25rem)] items-center justify-center gap-1.5 border text-[11px] font-medium tracking-wider uppercase transition-colors",
                  activeTab === tab.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {activeTab === "telescopes" ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              <TelescopesSection
                telescopes={telescopes}
                selected={selectedSet}
                onToggle={toggleTelescope}
                error={telescopeError}
              />
            </div>
          ) : null}
          <PhotosPanel
            active={sidebarOpen && activeTab === "photos"}
            onClose={() => setSidebarOpen(false)}
            focusKey={photosFocusKey}
            focusImageId={photosFocusImageId}
          />
          {activeTab === "missions" ? (
            <MissionsPanel
              active={sidebarOpen && activeTab === "missions"}
              telescopes={selectedIds
                .map((id) => telescopesById.get(id))
                .filter((t): t is SloohTelescope => t != null)}
            />
          ) : null}
          {activeTab === "config" ? (
            <div className="flex flex-col gap-4 px-3 pb-3">
              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Grid
                </div>
                <label
                  htmlFor="max-rows"
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
                >
                  <Rows3 className="size-3.5" />
                  Max rows
                </label>
                <input
                  id="max-rows"
                  type="number"
                  min={1}
                  max={16}
                  value={maxRows}
                  onChange={(e) =>
                    setMaxRows(clampInt(e.target.valueAsNumber, 1, 16))
                  }
                  className={inputClassName}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Frame overlays
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showHud}
                    onClick={() => setShowHud((v) => !v)}
                    className={cn(
                      "relative h-5 w-9 shrink-0 cursor-pointer border transition-colors",
                      showHud
                        ? "border-primary bg-primary/30"
                        : "border-border bg-card",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 size-3.5 transition-all",
                        showHud
                          ? "left-[calc(100%-1rem)] bg-primary"
                          : "left-0.5 bg-muted-foreground",
                      )}
                    />
                  </button>
                  Pointing HUD (RA/Dec · size · alt-az)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showChart}
                    onClick={() => setShowChart((v) => !v)}
                    className={cn(
                      "relative h-5 w-9 shrink-0 cursor-pointer border transition-colors",
                      showChart
                        ? "border-primary bg-primary/30"
                        : "border-border bg-card",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 size-3.5 transition-all",
                        showChart
                          ? "left-[calc(100%-1rem)] bg-primary"
                          : "left-0.5 bg-muted-foreground",
                      )}
                    />
                  </button>
                  Sky chart in object info
                </label>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
      {infoId ? (
        (() => {
          const infoTelescope = telescopesById.get(infoId) ?? null
          const infoObject = infoTelescope?.object ?? null
          const infoMission =
            (infoTelescope ? latest[infoTelescope.teleUniqueId] : undefined) ??
            infoTelescope?.mission ??
            null
          return (
            <ObjectInfoPopover
              telescope={infoTelescope}
              object={infoObject}
              astroObjectID={infoMission?.astroObjectID ?? null}
              showChart={showChart}
              onClose={() => setInfoId(null)}
            />
          )
        })()
      ) : null}
    </>
  )
}

export default Telescope
