import type { SloohTelescope } from "@/lib/slooh"

export function youtubeVideoId(urlOrId: string | null): string | null {
  if (!urlOrId) return null
  const s = urlOrId.trim()
  if (/^[\w-]{11}$/.test(s)) return s
  const m = s.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/,
  )
  return m ? m[1] : null
}

export function youtubeEmbedUrl(
  telescope: Pick<SloohTelescope, "streamCode" | "streamURL">,
): string | null {
  const id = youtubeVideoId(telescope.streamURL) || telescope.streamCode
  if (!id) return null
  return `https://www.youtube.com/embed/${id}?rel=0&autoplay=1&modestbranding=1&controls=0&showinfo=0&origin=${encodeURIComponent(window.location.origin)}`
}
