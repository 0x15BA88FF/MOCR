import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react"
import {
  Camera,
  Eye,
  EyeOff,
  GripVertical,
  Info,
  Loader2,
  Maximize,
  Minimize,
  RotateCw,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  formatAltAz,
  formatArcmin,
  formatDms,
  formatHms,
  hasCoords,
} from "@/lib/format"
import type { SloohObject, SloohTelescope } from "@/lib/slooh"
import type { MissionMeta } from "./types"
import { FrameContent } from "./FrameContent"

export interface FrameAction {
  icon: LucideIcon
  label: string
  onClick?: () => void
  onPointerDown?: (e: PointerEvent<HTMLButtonElement>) => void
  className?: string
}

export interface FrameProps {
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
  highlighted,
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
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!active) return
    const onClickOutside = (e: MouseEvent | TouchEvent) => {
      if (frameRef.current && !frameRef.current.contains(e.target as Node)) {
        setActive(false)
      }
    }
    document.addEventListener("pointerdown", onClickOutside)
    return () => document.removeEventListener("pointerdown", onClickOutside)
  }, [active])

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

  const frameTone =
    audioState === "playing"
      ? {
          frame: "border-emerald-500 ring-2 ring-emerald-500/50",
          move: "border-emerald-400 bg-emerald-500 text-slate-950",
        }
      : audioState === "waiting"
        ? {
            frame: "border-amber-500 ring-2 ring-amber-500/50",
            move: "border-amber-400 bg-amber-500 text-slate-950",
          }
        : {
            frame: "border-border hover:border-primary hover:ring-1 hover:ring-primary",
            move: "border-primary bg-primary text-primary-foreground",
          }

  return (
    <div
      ref={frameRef}
      data-frame-id={id}
      onClick={() => setActive((v) => !v)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={cn(
        "group relative min-h-0 min-w-0 flex-1 cursor-default touch-none select-none border-2 transition-opacity",
        dragging && "opacity-40",
        highlighted && "ring-2 ring-sky-300/60",
        frameTone.frame,
      )}
    >
      <FrameContent
        telescope={telescope}
        currentImgURL={currentImgURL}
        refreshKey={refreshKey}
      />
      <button
        type="button"
        aria-label={`Move ${telescope?.telescopeName ?? id}`}
        onPointerDown={(e) => {
          e.stopPropagation()
          onPointerDown(e, id)
        }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "absolute -left-[2px] -top-[2px] z-20 flex h-9 items-center gap-1.5 border-2 px-2.5 text-[10px] font-semibold tracking-[0.32em] uppercase transition-[opacity,transform] duration-200 cursor-grab active:cursor-grabbing",
          active
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto",
          frameTone.move,
        )}
      >
        <GripVertical className="size-3.5" />
      </button>
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
      <div
        className={cn(
          "absolute right-1.5 top-1.5 z-10 flex max-w-[calc(100%-3rem)] flex-wrap justify-end gap-1 transition-opacity duration-200",
          active
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto",
        )}
      >
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
              onClick={(e) => {
                e.stopPropagation()
                action.onClick?.()
              }}
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
          className={cn(
            "absolute bottom-1.5 left-1.5 z-10 max-w-[calc(100%-3rem)] border border-border/60 bg-black/70 px-1.5 py-0.5 transition-opacity duration-200",
            active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
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

export { Frame }
