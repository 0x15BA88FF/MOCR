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
  Radio,
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
import { AlertBell } from "@/components/alerts/AlertBell"
import { SkyPanel } from "@/components/sky/SkyPanel"
import { usePush } from "@/lib/usePush"
import {
  buildGridTiling,
  chunkWorkspaces,
  resolveFillDirection,
  type GridLayout,
} from "@/lib/tiling"
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
  // orderIds is the master layout order of every telescope. The grid only shows
  // the selected ones, but deselecting keeps an item in this list so it returns
  // to its position when selected again.
  const [orderIds, setOrderIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("mocr_order_ids")
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const readInt = (key: string, fallback: number): number => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? Number(raw) : fallback
    } catch {
      return fallback
    }
  }
  const readBool = (key: string, fallback: boolean): boolean => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? raw === "true" : fallback
    } catch {
      return fallback
    }
  }
  const detectPortrait = (): boolean => {
    if (typeof window === "undefined" || !window.matchMedia) return false
    return window.matchMedia("(orientation: portrait)").matches
  }
  const [maxRows, setMaxRows] = useState<number>(() =>
    readInt("mocr_max_rows", detectPortrait() ? 3 : 2),
  )
  const [maxCols, setMaxCols] = useState<number>(() =>
    readInt("mocr_max_cols", detectPortrait() ? 2 : 3),
  )
  // gridCustom is false until the user edits the grid, so the layout's proper
  // default (rows/cols inverted for portrait) keeps applying across rotations.
  const [gridCustom, setGridCustom] = useState<boolean>(() =>
    readBool("mocr_grid_custom", false),
  )
  const [activeWorkspace, setActiveWorkspace] = useState<number>(() =>
    readInt("mocr_active_workspace", 0),
  )
  const [layout, setLayout] = useState<GridLayout>(() => {
    try {
      const raw = localStorage.getItem("mocr_layout")
      if (raw === "landscape" || raw === "portrait" || raw === "auto") {
        return raw
      }
    } catch {}
    return "auto"
  })
  const [isPortrait, setIsPortrait] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false
    return window.matchMedia("(orientation: portrait)").matches
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<
    "telescopes" | "photos" | "config" | "missions" | "sky"
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
  const prevMissionIdRef = useRef<string | null>(null)
  const push = usePush()

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
      localStorage.setItem("mocr_order_ids", JSON.stringify(orderIds))
    } catch {}
  }, [orderIds])

  useEffect(() => {
    try {
      localStorage.setItem("mocr_active_workspace", String(activeWorkspace))
    } catch {}
  }, [activeWorkspace])

  useEffect(() => {
    try {
      localStorage.setItem("mocr_max_rows", String(maxRows))
    } catch {}
  }, [maxRows])

  useEffect(() => {
    try {
      localStorage.setItem("mocr_max_cols", String(maxCols))
    } catch {}
  }, [maxCols])

  useEffect(() => {
    try {
      localStorage.setItem("mocr_grid_custom", String(gridCustom))
    } catch {}
  }, [gridCustom])

  useEffect(() => {
    if (gridCustom) return
    setMaxRows(isPortrait ? 3 : 2)
    setMaxCols(isPortrait ? 2 : 3)
  }, [isPortrait, gridCustom])

  useEffect(() => {
    try {
      localStorage.setItem("mocr_layout", layout)
    } catch {}
  }, [layout])

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mql = window.matchMedia("(orientation: portrait)")
    const update = () => setIsPortrait(mql.matches)
    update()
    mql.addEventListener?.("change", update)
    return () => mql.removeEventListener?.("change", update)
  }, [])

  const telescopesById = useMemo(
    () => new Map(telescopes.map((t) => [t.teleUniqueId, t])),
    [telescopes],
  )

  // Keep the master order in sync with the telescopes that actually exist: drop
  // vanished ids and append newly-seen ones (seeding from current selection the
  // first time so an existing layout order is preserved on upgrade).
  const selectedIdsRef = useRef(selectedIds)
  selectedIdsRef.current = selectedIds
  useEffect(() => {
    if (telescopes.length === 0) return
    setOrderIds((prev) => {
      const ids = telescopes.map((t) => t.teleUniqueId)
      const present = new Set(ids)
      const base =
        prev.length > 0
          ? [...prev]
          : [
              ...selectedIdsRef.current,
              ...ids.filter((id) => !selectedIdsRef.current.includes(id)),
            ]
      const filtered = base.filter((id) => present.has(id))
      const kept = new Set(filtered)
      const appended = ids.filter((id) => !kept.has(id))
      return [...filtered, ...appended]
    })
  }, [telescopes])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const orderedSelectedIds = useMemo(
    () => orderIds.filter((id) => selectedSet.has(id)),
    [orderIds, selectedSet],
  )

  const workspaces = useMemo(
    () => chunkWorkspaces(orderedSelectedIds, maxRows, maxCols),
    [orderedSelectedIds, maxRows, maxCols],
  )
  const activeWorkspaceSafe = Math.min(
    activeWorkspace,
    Math.max(0, workspaces.length - 1),
  )
  const activeIds = useMemo(
    () => workspaces[activeWorkspaceSafe] ?? [],
    [workspaces, activeWorkspaceSafe],
  )

  useEffect(() => {
    if (activeWorkspace > workspaces.length - 1) {
      setActiveWorkspace(Math.max(0, workspaces.length - 1))
    }
  }, [workspaces.length, activeWorkspace])

  const tree = useMemo(
    () =>
      buildGridTiling(
        activeIds,
        maxRows,
        maxCols,
        resolveFillDirection(layout, isPortrait),
      ),
    [activeIds, maxRows, maxCols, layout, isPortrait],
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
          if (
            document.visibilityState === "hidden" &&
            id !== prevMissionIdRef.current &&
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            try {
              new Notification("MOCR · mission imagery", {
                body: payload.missionTitle || "New imagery available",
                icon: "/favicon.svg",
                tag: "mocr-mission-" + id,
              })
            } catch {}
          }
          prevMissionIdRef.current = id
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
      setOrderIds((prev) => swap(prev, id, overId))
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
    const id = t.teleUniqueId
    setSelectedIds((prev) => {
      const removing = prev.includes(id)
      if (removing && infoId === id) setInfoId(null)
      return removing ? prev.filter((x) => x !== id) : [...prev, id]
    })
    setOrderIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
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
    id: "telescopes" | "photos" | "config" | "missions" | "sky"
    label: string
    icon: typeof Satellite
  }[] = [
    { id: "telescopes", label: "Telescopes", icon: Satellite },
    { id: "missions", label: "Missions", icon: CalendarClock },
    { id: "photos", label: "Photos", icon: Images },
    { id: "sky", label: "Sky & Live", icon: Radio },
    { id: "config", label: "Config", icon: Rows3 },
  ]

  const inputClassName =
    "h-8 w-full border border-input bg-transparent px-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"

  return (
    <>
      <audio ref={globalAudioRef} preload="auto" className="hidden" />
      <main className="flex h-dvh w-full touch-none select-none p-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2">
            <div className="flex flex-wrap justify-center gap-1.5">
              {workspaces.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveWorkspace(i)}
                  aria-label={`Workspace ${i + 1}`}
                  aria-current={i === activeWorkspaceSafe}
                  className={cn(
                    "flex size-8 items-center justify-center border text-xs font-semibold transition-colors",
                    i === activeWorkspaceSafe
                      ? "border-primary bg-primary/20 text-primary"
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="Toggle control sidebar"
              aria-expanded={sidebarOpen}
              className={cn(
                "flex size-8 shrink-0 items-center justify-center border text-muted-foreground transition-colors hover:text-foreground",
                sidebarOpen && "border-primary bg-primary/10 text-primary",
              )}
            >
              <SlidersHorizontal className="size-4" />
            </button>
          </div>
        </div>
      </main>
      <aside
        aria-label="Control center"
        aria-hidden={!sidebarOpen}
        className={cn(
          "fixed top-4 right-4 bottom-4 z-10 flex w-90 max-sm:left-4 max-sm:w-auto flex-col border border-border bg-card transition-transform duration-200 ease-linear",
          sidebarOpen ? "translate-x-0" : "translate-x-[calc(100%+1rem)]",
        )}
      >
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Control Center
          </span>
          <div className="flex items-center gap-1.5">
            <AlertBell
              enabled={sidebarOpen}
              onOpenPhoto={(id) => openPhotosTo(id)}
            />
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close control sidebar"
              className="flex size-8 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
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
                orderIds={orderIds}
                selectedIds={selectedIds}
                onToggle={toggleTelescope}
                onReorder={(ids) => setOrderIds(ids)}
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
              telescopes={orderedSelectedIds
                .map((id) => telescopesById.get(id))
                .filter((t): t is SloohTelescope => t != null)}
            />
          ) : null}
          {activeTab === "sky" ? (
            <SkyPanel
              active={sidebarOpen && activeTab === "sky"}
              telescopes={orderedSelectedIds
                .map((id) => telescopesById.get(id))
                .filter((t): t is SloohTelescope => t != null)}
            />
          ) : null}
          {activeTab === "config" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-scroll px-3 pb-3">
              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Push notifications
                </div>
                {!push.supported ? (
                  <p className="text-[11px] leading-snug text-muted-foreground/80">
                    Push requires a secure context (https or localhost) and a
                    browser with service worker support.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      {push.enabled ? (
                        <>
                          <button
                            type="button"
                            onClick={push.disable}
                            disabled={push.busy}
                            className="w-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-red-500/50 hover:text-red-400"
                          >
                            {push.busy ? "Disabling…" : "Disable"}
                          </button>
                          <button
                            type="button"
                            onClick={push.test}
                            disabled={push.testBusy}
                            className="w-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                          >
                            {push.testBusy ? "Sending…" : "Send test push"}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={push.enable}
                          disabled={push.busy}
                          className="w-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                        >
                          {push.busy ? "Requesting…" : "Enable push notifications"}
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] leading-snug text-muted-foreground/80">
                      Receive system notifications for new Slooh alerts while the
                      tab is in the background.
                    </p>
                  </>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Rows3 className="size-3.5" />
                  Layout
                </label>
                <div className="flex gap-1">
                  {(
                    [
                      { value: "auto", label: "Auto" },
                      { value: "landscape", label: "Landscape" },
                      { value: "portrait", label: "Portrait" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setLayout(opt.value)}
                      aria-pressed={layout === opt.value}
                      className={cn(
                        "h-8 flex-1 border text-xs font-medium uppercase tracking-wider transition-colors",
                        layout === opt.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground/80">
                  Auto uses rows-first on portrait devices, columns-first otherwise.
                </p>
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
                  onChange={(e) => {
                    setGridCustom(true)
                    setMaxRows(clampInt(e.target.valueAsNumber, 1, 16))
                  }}
                  className={inputClassName}
                />
                <label
                  htmlFor="max-cols"
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
                >
                  <Rows3 className="size-3.5" />
                  Max columns
                </label>
                <input
                  id="max-cols"
                  type="number"
                  min={1}
                  max={16}
                  value={maxCols}
                  onChange={(e) => {
                    setGridCustom(true)
                    setMaxCols(clampInt(e.target.valueAsNumber, 1, 16))
                  }}
                  className={inputClassName}
                />
                <p className="text-[11px] leading-snug text-muted-foreground/80">
                  Defaults follow the device: 2×3 on desktop, 3×2 in portrait.
                  When a workspace overflows, frames split into numbered pages.
                </p>
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
