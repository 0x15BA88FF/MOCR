import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import type { SloohObject, SloohTelescope } from "@/lib/slooh"
import {
  formatAltAz,
  formatArcmin,
  formatDmsFull,
  formatHmsFull,
  hasCoords,
} from "@/lib/format"

function fovDegrees(object: SloohObject): number {
  const sizeDeg = (object.sizeArcSeconds ?? 7200) / 3600
  return Math.min(Math.max(sizeDeg * 3.5, 0.2), 60)
}

function aladinTarget(ra: number, dec: number): string {
  const h = Math.floor(ra)
  const m = Math.floor((ra - h) * 60)
  const s = Math.round(((ra - h) * 60 - m) * 60)
  const sign = dec < 0 ? "-" : "+"
  const a = Math.abs(dec)
  const d = Math.floor(a)
  const dm = Math.floor((a - d) * 60)
  const ds = Math.round(((a - d) * 60 - dm) * 60)
  return `${h} ${m} ${s} ${sign}${d} ${dm} ${ds}`
}

interface AladinInstance {
  addMarker: (marker: unknown) => void
  destroy?: () => void
}

interface AladinApi {
  init: Promise<unknown>
  aladin: (el: HTMLElement, opts: Record<string, unknown>) => AladinInstance
  marker: (ra: number, dec: number, opts?: Record<string, unknown>) => unknown
}

let aladinLoad: Promise<boolean> | null = null

function loadAladin(): Promise<boolean> {
  if (aladinLoad) return aladinLoad
  aladinLoad = new Promise((resolve) => {
    if (document.querySelector('script[src*="AladinLite"]')) {
      resolve(true)
      return
    }
    const s = document.createElement("script")
    s.src = "https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js"
    s.onload = () => resolve(true)
    s.onerror = () => resolve(false)
    document.head.appendChild(s)
  })
  return aladinLoad
}

function skyLinks(
  object: SloohObject,
  telescope: Pick<SloohTelescope, "latitude" | "longitude" | "elevationM"> & {
    telescopeName: string | null
  } | null,
): { label: string; href: string }[] {
  const links: { label: string; href: string }[] = []
  if (object.name) {
    const q = encodeURIComponent(object.name)
    links.push({
      label: "Wikipedia",
      href: `https://en.wikipedia.org/wiki/Special:Search?search=${q}`,
    })
    links.push({
      label: "SIMBAD",
      href: `https://simbad.cds.unistra.fr/simbad/sim-id?Ident=${q}`,
    })
    if (hasCoords(object)) {
      const fov = fovDegrees(object)
      const date = encodeURIComponent(new Date().toISOString())
      links.push({
        label: "Stellarium Web",
        href: `https://stellarium-web.org/skysource/${q}?fov=${fov.toFixed(2)}&date=${date}&lat=${telescope?.latitude ?? 0}&lng=${telescope?.longitude ?? 0}&elev=${telescope?.elevationM ?? 0}`,
      })
    }
  }
  if (hasCoords(object)) {
    const fov = fovDegrees(object)
    links.push({
      label: "ESASky",
      href: `https://sky.esa.int/esasky?target=${object.ra} ${object.dec}&fov=${fov.toFixed(2)}`,
    })
  }
  if (object.altAz && telescope?.latitude != null && telescope.longitude != null) {
    const date = encodeURIComponent(new Date().toISOString())
    links.push({
      label: "Stellarium Web (alt/az)",
      href: `https://stellarium-web.org/?alt=${object.altAz.altitude.toFixed(2)}&az=${object.altAz.azimuth.toFixed(2)}&fov=${fovDegrees(object).toFixed(2)}&date=${date}&lat=${telescope.latitude}&lng=${telescope.longitude}&elev=${telescope.elevationM ?? 0}`,
    })
  }
  return links
}

export function ObjectInfoPopover({
  telescope,
  object,
  astroObjectID,
  showChart,
  loading = false,
  onClose,
}: {
  telescope: Pick<SloohTelescope, "latitude" | "longitude" | "elevationM"> & {
    telescopeName: string | null
  } | null
  object: SloohObject | null
  astroObjectID: string | null
  showChart: boolean
  loading?: boolean
  onClose: () => void
}) {
  const chartRef = useRef<HTMLDivElement>(null)
  const [chartFailed, setChartFailed] = useState(false)

  const hasObjectId = astroObjectID != null && astroObjectID !== "0"
  const hasPosition = hasCoords(object)
  const ra = hasPosition ? object.ra : null
  const dec = hasPosition ? object.dec : null
  const fov = object ? fovDegrees(object) : 5
  const links = object ? skyLinks(object, telescope) : []

  useEffect(() => {
    if (!showChart || ra == null || dec == null || !chartRef.current) return
    let disposed = false
    let instance: AladinInstance | null = null
    ;(async () => {
      const loaded = await loadAladin()
      if (!loaded) {
        setChartFailed(true)
        return
      }
      const A = (window as unknown as { A?: AladinApi }).A
      if (!A) {
        setChartFailed(true)
        return
      }
      await A.init.catch(() => {})
      if (disposed || !chartRef.current) return
      instance = A.aladin(chartRef.current, {
        target: aladinTarget(ra, dec),
        fov,
        survey: "P/DSS2/color",
        showReticle: true,
        showCooGrid: true,
        showCooGridControl: true,
        showZoomControl: true,
        showFullscreenControl: false,
        showSimbadPointerControl: true,
        showLayersControl: true,
      })
      instance.addMarker(A.marker(ra, dec, { popupTitle: object?.name ?? "target" }))
    })()
    return () => {
      disposed = true
      try {
        instance?.destroy?.()
      } catch {}
    }
  }, [showChart, ra, dec, fov, object?.name])

  const rows: { label: string; value: string }[] = object
    ? [
        { label: "Type", value: object.type ?? "—" },
        { label: "Constellation", value: object.constellation ?? "—" },
        ...(hasPosition
          ? [
              {
                label: "Coordinates",
                value:
                  object.coordinatesDisplay ??
                  `${formatHmsFull(object.ra)} ${formatDmsFull(object.dec)}`,
              },
            ]
          : []),
        { label: "Size", value: formatArcmin(object.sizeArcSeconds) ?? "—" },
        { label: "Magnitude", value: object.magnitude ?? "—" },
        { label: "Distance", value: object.distance ?? "—" },
        { label: "From observatory", value: formatAltAz(object.altAz) ?? "—" },
      ]
    : []

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[85dvh] w-full max-w-xl flex-col gap-3 overflow-y-auto border border-border bg-card p-4 shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">
              {object?.name ??
                (loading
                  ? "Loading object info…"
                  : hasObjectId
                    ? "No object data"
                    : "No object tracked")}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              {telescope?.telescopeName ?? "—"} · astroObjectID {astroObjectID ?? "—"}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close object info"
            onClick={onClose}
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {object ? (
          <>
            {showChart && ra != null && dec != null ? (
              <div className="relative h-44 w-full overflow-hidden border border-border bg-black">
                <div ref={chartRef} className="size-full" />
                {chartFailed ? (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] tracking-widest text-white/40 uppercase">
                    sky chart unavailable
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-col">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between gap-2 border-b border-border/40 py-1"
                >
                  <span className="shrink-0 text-[9px] tracking-widest text-muted-foreground uppercase">
                    {row.label}
                  </span>
                  <span className="text-right font-mono text-[11px] text-foreground">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            {object.description ? (
              <p className="max-h-28 overflow-y-auto border border-border/40 bg-background/60 p-2 text-[10px] leading-relaxed text-muted-foreground">
                {object.description}
              </p>
            ) : null}
            {links.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {links.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="cursor-pointer border border-border bg-background px-2 py-1 text-[10px] text-sky-300 transition-colors hover:border-primary hover:text-sky-200"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className="border border-border/40 bg-background/60 p-2 text-[10px] leading-relaxed text-muted-foreground">
            {loading
              ? "Fetching object details from Slooh…"
              : hasObjectId
                ? "Slooh returned no record for this object id (it may be retired, hidden, or the id may be invalid)."
                : "No object is linked to this item — the record carries no astroObjectID (0 = no target)."}
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
