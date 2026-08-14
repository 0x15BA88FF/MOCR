import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Download, Info, RefreshCw, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SloohObject, SloohSite } from "@/lib/slooh"
import { ObjectInfoPopover } from "@/components/ObjectInfoPopover"

export interface SloohPhoto {
  customerImageId: number
  imageId: number
  title: string | null
  url: string | null
  downloadURL: string | null
  filename: string | null
  displayDate: string | null
  displayTime: string | null
  imageTimestamp: string | null
  observatoryName: string | null
  telescopeName: string | null
  instrumentName: string | null
  objectId: number | null
  scheduledMissionId: number | null
  shareToken: string | null
}

const PAGE_SIZE = 24

function PhotoGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="aspect-square animate-pulse border border-border bg-card" />
      ))}
    </div>
  )
}

export default function PhotosPanel({
  active,
  onClose,
  focusKey,
  focusImageId,
}: {
  active: boolean
  onClose: () => void
  focusKey: number | null
  focusImageId: number | null
}) {
  const [images, setImages] = useState<SloohPhoto[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const [selected, setSelected] = useState<SloohPhoto | null>(null)
  const [info, setInfo] = useState<{
    photo: SloohPhoto
    object: SloohObject | null
    site: SloohSite | null
    error: string | null
    loading: boolean
  } | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pendingFocus = useRef<number | null>(null)
  const pendingImageId = useRef<number | null>(null)
  const highlightTimer = useRef<number | undefined>(undefined)

  const load = useCallback(async (targetPage: number, replace: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/photos?page=${targetPage}&pageSize=${PAGE_SIZE}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as {
        images: SloohPhoto[]
        total: number
      } | null
      if (!data) return null
      setTotal(data.total)
      setImages((prev) => (replace ? data.images : [...prev, ...data.images]))
      setPage(targetPage)
      return data
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed")
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (focusKey) pendingFocus.current = focusKey
    if (focusImageId != null) pendingImageId.current = focusImageId
    if (!active) {
      pendingFocus.current = null
      pendingImageId.current = null
      return
    }
    scrollRef.current?.scrollTo({ top: 0 })
    load(1, true).then((data) => {
      const key = pendingFocus.current
      pendingFocus.current = null
      if (!key || !data?.images.length) return
      const target =
        pendingImageId.current != null
          ? data.images.find((img) => img.customerImageId === pendingImageId.current) ??
            data.images[0]
          : data.images[0]
      pendingImageId.current = null
      setHighlightId(target.customerImageId)
      window.clearTimeout(highlightTimer.current)
      highlightTimer.current = window.setTimeout(() => setHighlightId(null), 4000)
    })
    return () => window.clearTimeout(highlightTimer.current)
  }, [active, focusKey, focusImageId, load])

  const openInfo = useCallback(async (photo: SloohPhoto) => {
    setInfo({ photo, object: null, site: null, error: null, loading: true })
    try {
      const params = new URLSearchParams()
      if (photo.objectId != null) params.set("objectId", String(photo.objectId))
      if (photo.observatoryName) params.set("obsName", photo.observatoryName)
      if (photo.imageTimestamp) {
        const time = Number(photo.imageTimestamp)
        if (Number.isFinite(time)) params.set("time", String(Math.floor(time)))
      }
      const res = await fetch(`/api/object-summary?${params.toString()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as {
        object: SloohObject | null
        site: SloohSite | null
      } | null
      setInfo((prev) =>
        prev?.photo === photo
          ? {
              ...prev,
              object: data?.object ?? null,
              site: data?.site ?? null,
              loading: false,
            }
          : prev,
      )
    } catch (e) {
      setInfo((prev) =>
        prev?.photo === photo
          ? {
              ...prev,
              error: e instanceof Error ? e.message : "request failed",
              loading: false,
            }
          : prev,
      )
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (info) {
        e.stopImmediatePropagation()
        setInfo(null)
      } else if (selected) {
        e.stopImmediatePropagation()
        setSelected(null)
      } else {
        onClose()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [active, selected, info, onClose])

  const hasMore = images.length < total
  const q = search.trim().toLowerCase()
  const visible = useMemo(() => {
    if (!q)
      return images
    return images.filter((img) =>
      [img.title, img.telescopeName, img.observatoryName, img.instrumentName, img.displayDate]
        .some((v) => v != null && v.toLowerCase().includes(q)),
    )
  }, [images, q])

  const inputClassName =
    "h-8 w-full border border-input bg-transparent px-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"

  return (
    <div className={cn("min-h-0 flex-1 flex-col", active ? "flex" : "hidden")}>
      <div className="px-3 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, telescope, observatory…"
            className={cn(inputClassName, "pl-7")}
          />
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {error ? (
          <p className="border border-red-900/60 bg-red-950/30 px-2 py-1.5 text-[10px] leading-relaxed text-red-300">
            failed to load photos ({error}). Start the server with{" "}
            <code className="text-red-200">pnpm dev:server</code>.
          </p>
        ) : null}
        {!error && loading && images.length === 0 ? <PhotoGridSkeleton /> : null}
        {!error && !loading && images.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] leading-relaxed text-muted-foreground">
            No photos yet. Take a picture from a telescope tile to save it to your
            Slooh account.
          </p>
        ) : null}
        {visible.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {visible.map((img) => (
              <button
                key={img.customerImageId}
                type="button"
                onClick={() => setSelected(img)}
                className={cn(
                  "group relative aspect-square cursor-pointer overflow-hidden border transition-colors",
                  highlightId === img.customerImageId
                    ? "border-primary ring-2 ring-primary"
                    : "border-border hover:border-primary",
                )}
              >
                {img.url ? (
                  <img
                    src={img.url}
                    alt={img.title ?? img.filename ?? "photo"}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center bg-muted text-[10px] text-muted-foreground">
                    no image
                  </div>
                )}
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pt-4 pb-1 text-left">
                  <span className="block truncate text-[10px] leading-tight font-medium text-white">
                    {img.title ?? img.filename ?? "photo"}
                  </span>
                  <span className="block truncate text-[9px] text-white/70">
                    {[img.displayDate, img.telescopeName].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {q && visible.length === 0 && images.length > 0 ? (
          <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">
            no matches for “{search}”
          </p>
        ) : null}
        {hasMore ? (
          <button
            type="button"
            onClick={() => load(page + 1, false)}
            disabled={loading}
            className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 border border-border bg-card text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-60"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Load more
          </button>
        ) : null}
        {!hasMore && images.length > 0 ? (
          <p className="mt-3 text-center text-[10px] text-muted-foreground/60">
            you’ve seen all {images.length} of {total} photos
          </p>
        ) : null}
      </div>
      {active && selected && selected.url
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6"
              onClick={() => setSelected(null)}
            >
              <div
                className="flex max-h-full max-w-full flex-col gap-3"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {selected.title ?? selected.filename ?? "photo"}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {[selected.displayDate, selected.displayTime, selected.telescopeName, selected.observatoryName]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => openInfo(selected)}
                      className="flex h-8 items-center gap-1.5 border border-border bg-card px-3 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                    >
                      <Info className="size-3.5" />
                      Info
                    </button>
                    {selected.downloadURL ? (
                      <a
                        href={selected.downloadURL}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-8 items-center gap-1.5 border border-border bg-card px-3 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                      >
                        <Download className="size-3.5" />
                        Download
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      aria-label="Close preview"
                      className="flex size-8 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
                <img
                  src={selected.url}
                  alt={selected.title ?? selected.filename ?? "photo"}
                  className="max-h-[82dvh] w-auto max-w-full border border-border object-contain shadow-2xl"
                />
              </div>
            </div>,
            document.body,
          )
        : null}
      {active && selected && info ? (
        <ObjectInfoPopover
          telescope={{
            telescopeName: info.photo.telescopeName,
            latitude: info.site?.latitude ?? null,
            longitude: info.site?.longitude ?? null,
            elevationM: info.site?.elevationM ?? null,
          }}
          object={info.object}
          astroObjectID={info.photo.objectId != null ? String(info.photo.objectId) : null}
          showChart
          loading={info.loading}
          onClose={() => setInfo(null)}
        />
      ) : null}
    </div>
  )
}
