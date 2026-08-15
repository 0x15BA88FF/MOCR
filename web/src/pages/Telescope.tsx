import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react"
import {
  CalendarClock,
  Images,
  Rows3,
  Satellite,
  SlidersHorizontal,
  X,
} from "lucide-react"
import { toast } from "sonner"
import MissionsPanel from "@/components/MissionsPanel"
import PhotosPanel from "@/components/PhotosPanel"
import { ObjectInfoPopover } from "@/components/ObjectInfoPopover"
import { FrameGrid } from "@/components/FrameGrid"
import { TelescopesSection } from "@/components/sidebar/TelescopeList"
import { buildGridTiling } from "@/lib/tiling"
import { cn } from "@/lib/utils"
import type { FrameMeta } from "@/components/frame/types"
import type { SloohTelescope } from "@/lib/slooh"

export type { SloohObject, SloohTelescope } from "@/lib/slooh"

function swap(array: readonly string[], a: string, b: string): string[] {
  const next = [...array]
  const i = next.indexOf(a)
  const j = next.indexOf(b)
  if (i === -1 || j === -1) return next
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

const clampInt = (value: number, min: number, max: number): number =>
  Number.isNaN(value) ? min : Math.min(max, Math.max(min, Math.round(value)))

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
    icon: typeof Satellite
  }[] = [
    { id: "telescopes", label: "Telescopes", icon: Satellite },
    { id: "missions", label: "Missions", icon: CalendarClock },
    { id: "photos", label: "Photos", icon: Images },
    { id: "config", label: "Config", icon: Rows3 },
  ]

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const inputClassName =
    "h-8 w-full border border-input bg-transparent px-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"

  return (
    <>
      <audio ref={globalAudioRef} preload="auto" className="hidden" />
      <main className="flex h-dvh w-full touch-none select-none p-4">
        <FrameGrid
          tree={tree}
          telescopesById={telescopesById}
          latest={latest}
          activeAudioTeleId={activeAudioTeleId}
          activeAudioURL={activeAudioURL}
          dragId={dragId}
          overId={overId}
          focusedIds={focusedIds}
          showHud={showHud}
          infoId={infoId}
          refreshKeys={refreshKeys}
          onToggleAudio={toggleAudioFor}
          onRefreshFrame={handleRefreshFrame}
          onToggleInfo={(id) => setInfoId((cur) => (cur === id ? null : id))}
          onToggleFocus={toggleFrameFocus}
          onCaptured={openPhotosTo}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        />
      </main>
      <button
        type="button"
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label="Toggle control sidebar"
        aria-expanded={sidebarOpen}
        className={cn(
          "fixed bottom-4 z-20 flex size-10 items-center justify-center border-2 border-sky-300 bg-primary text-primary-foreground transition-[right] duration-200 ease-linear hover:bg-primary/90 active:bg-primary/80",
          sidebarOpen ? "right-[calc(20rem+1.5rem)]" : "right-4",
        )}
      >
        <SlidersHorizontal className="size-4.5" />
      </button>
      <aside
        aria-label="Control center"
        aria-hidden={!sidebarOpen}
        className={cn(
          "fixed top-4 right-4 bottom-4 z-10 flex w-90 flex-col border border-border bg-card transition-transform duration-200 ease-linear",
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
