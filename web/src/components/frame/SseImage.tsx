import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type SyntheticEvent,
} from "react"
import { cn } from "@/lib/utils"
import type { Size, ViewState } from "./types"

const fadeMs = 700
const MIN_ZOOM = 1
const MAX_ZOOM = 6
const MINIMAP_WIDTH = 128
const MINIMAP_HEIGHT = 84

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function SseImage({ src, alt }: { src: string; alt: string }) {
  const [newest, setNewest] = useState(src)
  const [outgoing, setOutgoing] = useState<string | null>(null)
  const [fading, setFading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [naturalSize, setNaturalSize] = useState<Size | null>(null)
  const [viewportSize, setViewportSize] = useState<Size>({ width: 0, height: 0 })
  const [view, setView] = useState<ViewState>({ zoom: 1, offsetX: 0, offsetY: 0 })
  const [panning, setPanning] = useState(false)
  const [minimapDragging, setMinimapDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const minimapRef = useRef<HTMLDivElement>(null)
  const panGestureRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startView: ViewState
  } | null>(null)
  const pointersRef = useRef<Map<number, { clientX: number; clientY: number }>>(new Map())
  const pinchRef = useRef<{ startDist: number; prevDist: number } | null>(null)
  const minimapGestureRef = useRef<{
    pointerId: number
  } | null>(null)
  const viewRef = useRef(view)

  useLayoutEffect(() => {
    viewRef.current = view
  }, [view])

  useEffect(() => {
    if (src === newest) return
    setOutgoing(newest)
    setNewest(src)
    setFailed(false)
    setFading(false)
  }, [src, newest])

  useEffect(() => {
    if (!outgoing) return
    const timer = setTimeout(() => setOutgoing(null), fadeMs + 100)
    return () => clearTimeout(timer)
  }, [outgoing])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const { width, height } = el.getBoundingClientRect()
      setViewportSize({ width, height })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const baseSize = useMemo(() => {
    if (!naturalSize || viewportSize.width <= 0 || viewportSize.height <= 0) return null
    const fitScale = Math.min(
      viewportSize.width / naturalSize.width,
      viewportSize.height / naturalSize.height,
    )
    return {
      width: naturalSize.width * fitScale,
      height: naturalSize.height * fitScale,
      fitScale,
    }
  }, [naturalSize, viewportSize.width, viewportSize.height])

  const clampView = useCallback(
    (next: ViewState): ViewState => {
      if (!baseSize) return next
      const scaledWidth = baseSize.width * next.zoom
      const scaledHeight = baseSize.height * next.zoom
      const maxOffsetX = Math.max(0, (scaledWidth - viewportSize.width) / 2)
      const maxOffsetY = Math.max(0, (scaledHeight - viewportSize.height) / 2)
      return {
        zoom: clamp(next.zoom, MIN_ZOOM, MAX_ZOOM),
        offsetX: clamp(next.offsetX, -maxOffsetX, maxOffsetX),
        offsetY: clamp(next.offsetY, -maxOffsetY, maxOffsetY),
      }
    },
    [baseSize, viewportSize.width, viewportSize.height],
  )

  useEffect(() => {
    setView((cur) => clampView(cur))
  }, [clampView, naturalSize])

  const beginPan = (pointerId: number, clientX: number, clientY: number) => {
    panGestureRef.current = {
      pointerId,
      startX: clientX,
      startY: clientY,
      startView: viewRef.current,
    }
    setPanning(true)
  }

  const updatePan = (clientX: number, clientY: number) => {
    const gesture = panGestureRef.current
    if (!gesture || !baseSize) return
    const next = clampView({
      zoom: gesture.startView.zoom,
      offsetX: gesture.startView.offsetX + (clientX - gesture.startX),
      offsetY: gesture.startView.offsetY + (clientY - gesture.startY),
    })
    setView(next)
  }

  const endPan = () => {
    panGestureRef.current = null
    setPanning(false)
  }

  const recenterFromMinimap = (clientX: number, clientY: number) => {
    if (!minimapGestureRef.current || !baseSize) return
    const rect = minimapRef.current?.getBoundingClientRect()
    if (!rect) return

    const fitScale = Math.min(
      (MINIMAP_WIDTH - 8) / baseSize.width,
      (MINIMAP_HEIGHT - 8) / baseSize.height,
    )
    const displayWidth = baseSize.width * fitScale
    const displayHeight = baseSize.height * fitScale
    const left = (MINIMAP_WIDTH - displayWidth) / 2
    const top = (MINIMAP_HEIGHT - displayHeight) / 2
    const x = clamp(clientX - rect.left, left, left + displayWidth)
    const y = clamp(clientY - rect.top, top, top + displayHeight)
    const localX = (x - left) / displayWidth - 0.5
    const localY = (y - top) / displayHeight - 0.5
    const next = clampView({
      ...viewRef.current,
      offsetX: -viewRef.current.zoom * localX * baseSize.width,
      offsetY: -viewRef.current.zoom * localY * baseSize.height,
    })
    setView(next)
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleWheelNative = (event: Event) => {
      const e = event as unknown as globalThis.WheelEvent
      if (!baseSizeRef.current) return
      e.preventDefault()
      e.stopPropagation()
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const cur = viewRef.current
      const zoomFactor = Math.exp(-e.deltaY * 0.0015)
      const nextZoom = clamp(cur.zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM)
      const ratio = nextZoom / cur.zoom
      const pointerX = e.clientX - rect.left - rect.width / 2
      const pointerY = e.clientY - rect.top - rect.height / 2
      const next = clampView({
        zoom: nextZoom,
        offsetX: pointerX * (1 - ratio) + ratio * cur.offsetX,
        offsetY: pointerY * (1 - ratio) + ratio * cur.offsetY,
      })
      setView(next)
    }
    el.addEventListener("wheel", handleWheelNative, { passive: false })
    return () => el.removeEventListener("wheel", handleWheelNative)
  }, [baseSize, clampView])

  const baseSizeRef = useRef(baseSize)
  useEffect(() => {
    baseSizeRef.current = baseSize
  }, [baseSize])

  const handleImageLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setNaturalSize({
      width: img.naturalWidth,
      height: img.naturalHeight,
    })
    setFailed(false)
    setFading(true)
  }

  const handlePointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || !baseSize) return
    e.preventDefault()
    e.stopPropagation()
    pointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY })
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}

    if (pointersRef.current.size === 2) {
      panGestureRef.current = null
      setPanning(false)
      const pts = Array.from(pointersRef.current.values())
      const dist = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY)
      pinchRef.current = { startDist: dist, prevDist: dist }
    } else if (pointersRef.current.size === 1) {
      beginPan(e.pointerId, e.clientX, e.clientY)
    }
  }

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY })

    if (pointersRef.current.size >= 2) {
      e.preventDefault()
      e.stopPropagation()
      const pts = Array.from(pointersRef.current.values())
      const currDist = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY)
      const pinch = pinchRef.current
      if (!pinch || !baseSize) return

      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const centerX = (pts[0].clientX + pts[1].clientX) / 2
      const centerY = (pts[0].clientY + pts[1].clientY) / 2

      const zoomFactor = currDist / (pinch.prevDist || currDist)
      pinch.prevDist = currDist

      const cur = viewRef.current
      const nextZoom = clamp(cur.zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM)
      const ratio = nextZoom / cur.zoom
      const pointerX = centerX - rect.left - rect.width / 2
      const pointerY = centerY - rect.top - rect.height / 2

      const next = clampView({
        zoom: nextZoom,
        offsetX: pointerX * (1 - ratio) + ratio * cur.offsetX,
        offsetY: pointerY * (1 - ratio) + ratio * cur.offsetY,
      })
      setView(next)
    } else if (pointersRef.current.size === 1) {
      if (!panGestureRef.current || panGestureRef.current.pointerId !== e.pointerId) return
      e.preventDefault()
      e.stopPropagation()
      updatePan(e.clientX, e.clientY)
    }
  }

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) {
      pinchRef.current = null
    }
    if (pointersRef.current.size === 1) {
      const entry = Array.from(pointersRef.current.entries())[0]
      if (entry) {
        const [remainingId, pt] = entry
        beginPan(remainingId, pt.clientX, pt.clientY)
      }
    } else {
      endPan()
    }
  }

  const handlePointerCancel = (e: PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId)
    pinchRef.current = null
    endPan()
  }

  const handleMinimapPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !baseSize) return
    e.preventDefault()
    e.stopPropagation()
    minimapGestureRef.current = { pointerId: e.pointerId }
    e.currentTarget.setPointerCapture(e.pointerId)
    setMinimapDragging(true)
    recenterFromMinimap(e.clientX, e.clientY)
  }

  const handleMinimapPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!minimapGestureRef.current || minimapGestureRef.current.pointerId !== e.pointerId) return
    e.preventDefault()
    e.stopPropagation()
    recenterFromMinimap(e.clientX, e.clientY)
  }

  const endMinimapDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!minimapGestureRef.current || minimapGestureRef.current.pointerId !== e.pointerId) return
    e.preventDefault()
    e.stopPropagation()
    minimapGestureRef.current = null
    setMinimapDragging(false)
  }

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
    <div
      ref={containerRef}
      className="group pointer-events-auto absolute inset-0 z-0 overflow-hidden bg-black"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {outgoing && (
        <img
          src={outgoing}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-cover opacity-70"
        />
      )}
      <img
        src={newest}
        alt={alt}
        draggable={false}
        onLoad={handleImageLoad}
        onError={() => setFailed(true)}
        className={cn(
          "absolute left-1/2 top-1/2 max-w-none select-none transition-[opacity,width,height] duration-[700ms] ease-in-out",
          panning && "cursor-grabbing",
          !panning && "cursor-grab",
          fading ? "opacity-100" : "opacity-0",
        )}
        style={
          baseSize
            ? {
                width: `${baseSize.width * view.zoom}px`,
                height: `${baseSize.height * view.zoom}px`,
                transform: `translate(-50%, -50%) translate(${view.offsetX}px, ${view.offsetY}px)`,
              }
            : {
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }
        }
      />
      {baseSize ? (
        <div
          ref={minimapRef}
          className={cn(
            "pointer-events-none absolute right-2 bottom-2 z-20 overflow-hidden border border-white/20 bg-black/75 opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100",
            minimapDragging && "ring-1 ring-primary/70",
          )}
          style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
          onPointerDown={handleMinimapPointerDown}
          onPointerMove={handleMinimapPointerMove}
          onPointerUp={endMinimapDrag}
          onPointerCancel={endMinimapDrag}
        >
          <img
            src={newest}
            alt=""
            draggable={false}
            className="absolute left-1/2 top-1/2 max-w-none select-none opacity-70"
            style={{
              width: `${baseSize.width * (Math.min((MINIMAP_WIDTH - 8) / baseSize.width, (MINIMAP_HEIGHT - 8) / baseSize.height))}px`,
              height: `${baseSize.height * (Math.min((MINIMAP_WIDTH - 8) / baseSize.width, (MINIMAP_HEIGHT - 8) / baseSize.height))}px`,
              transform: "translate(-50%, -50%)",
              left: "50%",
              top: "50%",
            }}
          />
          <MinimapOverlay
            baseSize={baseSize}
            viewportSize={viewportSize}
            view={view}
          />
          <div className="pointer-events-none absolute top-1 left-1 rounded bg-black/55 px-1 py-0.5 text-[9px] tracking-[0.28em] text-white/75 uppercase">
            zoom {view.zoom.toFixed(1)}x
          </div>
        </div>
      ) : null}
    </div>
  )
}

function MinimapOverlay({
  baseSize,
  viewportSize,
  view,
}: {
  baseSize: { width: number; height: number }
  viewportSize: Size
  view: ViewState
}) {
  const fitScale = Math.min(
    (MINIMAP_WIDTH - 8) / baseSize.width,
    (MINIMAP_HEIGHT - 8) / baseSize.height,
  )
  const displayWidth = baseSize.width * fitScale
  const displayHeight = baseSize.height * fitScale
  const left = (MINIMAP_WIDTH - displayWidth) / 2
  const top = (MINIMAP_HEIGHT - displayHeight) / 2
  const visibleLeft = (-viewportSize.width / 2 - view.offsetX) / view.zoom
  const visibleTop = (-viewportSize.height / 2 - view.offsetY) / view.zoom
  const visibleRight = (viewportSize.width / 2 - view.offsetX) / view.zoom
  const visibleBottom = (viewportSize.height / 2 - view.offsetY) / view.zoom
  const clampLeft = clamp((visibleLeft + baseSize.width / 2) / baseSize.width, 0, 1)
  const clampTop = clamp((visibleTop + baseSize.height / 2) / baseSize.height, 0, 1)
  const clampRight = clamp((visibleRight + baseSize.width / 2) / baseSize.width, 0, 1)
  const clampBottom = clamp((visibleBottom + baseSize.height / 2) / baseSize.height, 0, 1)

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
    >
      <div
        className="absolute border border-sky-300/70 bg-sky-300/15"
        style={{
          left: left + clampLeft * displayWidth,
          top: top + clampTop * displayHeight,
          width: Math.max(8, (clampRight - clampLeft) * displayWidth),
          height: Math.max(8, (clampBottom - clampTop) * displayHeight),
        }}
      />
    </div>
  )
}

export { SseImage }
