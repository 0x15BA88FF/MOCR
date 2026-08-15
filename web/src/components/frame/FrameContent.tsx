import type { SloohTelescope } from "@/lib/slooh"
import { youtubeEmbedUrl } from "@/lib/youtube"
import { SseImage } from "./SseImage"

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
    return (
      <SseImage
        src={freshURL}
        alt={telescope.telescopeName}
      />
    )
  }
  return (
    <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
      <span className="animate-pulse text-xs tracking-widest text-white/40 uppercase">
        waiting for feed…
      </span>
    </div>
  )
}

export { FrameContent }
