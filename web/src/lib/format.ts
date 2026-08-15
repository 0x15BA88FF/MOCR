import type { SloohObject } from "@/lib/slooh"

export const pad2 = (n: number): string =>
  String(Math.max(0, Math.floor(n))).padStart(2, "0")

export const hasCoords = (
  o: SloohObject | null,
): o is SloohObject & { ra: number; dec: number } =>
  o != null && o.ra != null && o.dec != null && (o.ra !== 0 || o.dec !== 0)

export function formatHms(ra: number): string {
  const h = Math.floor(ra)
  const m = Math.floor((ra - h) * 60)
  return `${pad2(h)}h ${pad2(m)}m`
}

export function formatDms(dec: number): string {
  const sign = dec < 0 ? "−" : "+"
  const a = Math.abs(dec)
  const d = Math.floor(a)
  const m = Math.floor((a - d) * 60)
  return `${sign}${pad2(d)}° ${pad2(m)}′`
}

export function formatArcmin(sizeArcSeconds: number | null): string | null {
  if (sizeArcSeconds == null) return null
  return `${(sizeArcSeconds / 60).toFixed(1).replace(/\.0$/, "")}′`
}

export function compassDir(azimuth: number): string {
  const dirs = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ]
  return dirs[Math.round(((azimuth % 360) / 22.5)) % 16]
}

export function formatAltAz(altAz: SloohObject["altAz"]): string | null {
  if (!altAz) return null
  return `alt ${altAz.altitude.toFixed(1)}° az ${altAz.azimuth.toFixed(1)}° (${compassDir(altAz.azimuth)})`
}

export function formatHmsFull(ra: number): string {
  const h = Math.floor(ra)
  const m = Math.floor((ra - h) * 60)
  const s = Math.round(((ra - h) * 60 - m) * 60)
  return `${pad2(h)}h ${pad2(m)}m ${pad2(s)}s`
}

export function formatDmsFull(dec: number): string {
  const sign = dec < 0 ? "−" : "+"
  const a = Math.abs(dec)
  const d = Math.floor(a)
  const m = Math.floor((a - d) * 60)
  const s = Math.round(((a - d) * 60 - m) * 60)
  return `${sign}${pad2(d)}° ${pad2(m)}′ ${pad2(s)}″`
}
