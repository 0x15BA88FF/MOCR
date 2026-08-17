import { useMemo, useEffect, useState, type PointerEvent } from "react"
import { GripVertical, Satellite } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SloohTelescope } from "@/lib/slooh"

export function TelescopesSection({
  telescopes,
  orderIds,
  selectedIds,
  onToggle,
  onReorder,
  error,
}: {
  telescopes: SloohTelescope[]
  orderIds: string[]
  selectedIds: string[]
  onToggle: (t: SloohTelescope) => void
  onReorder: (ids: string[]) => void
  error: string | null
}) {
  const byId = useMemo(
    () => new Map(telescopes.map((t) => [t.teleUniqueId, t])),
    [telescopes],
  )
  const ordered = orderIds
    .map((id) => byId.get(id))
    .filter((t): t is SloohTelescope => Boolean(t))
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const onlineCount = telescopes.filter((t) => t.online).length

  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  useEffect(() => {
    if (draggingIndex === null) return

    const onPointerMove = (e: globalThis.PointerEvent) => {
      const el = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>("[data-reorder-index]")
      const idx = el ? Number(el.dataset.reorderIndex) : null
      setOverIndex(idx)
    }

    const onPointerUp = () => {
      const from = draggingIndex
      const to = overIndex
      setDraggingIndex(null)
      setOverIndex(null)
      if (from === null || to === null || to === from) return
      const next = [...orderIds]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      onReorder(next)
    }

    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", onPointerUp)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", onPointerUp)
    }
  }, [draggingIndex, overIndex, orderIds, onReorder])

  const handleGripDown = (
    e: PointerEvent<HTMLSpanElement>,
    index: number,
  ) => {
    e.preventDefault()
    e.stopPropagation()
    setDraggingIndex(index)
    setOverIndex(index)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          <Satellite className="size-3.5" />
          Telescopes
        </span>
        <span className="text-[10px] text-muted-foreground">
          {onlineCount}/{telescopes.length} online
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
      {ordered.map((t, i) => {
        const selected = selectedSet.has(t.teleUniqueId)
        const dragging = draggingIndex === i
        const isOver = overIndex === i && draggingIndex !== null && !dragging
        return (
          <button
            key={t.teleUniqueId}
            type="button"
            data-reorder-index={i}
            onClick={() => onToggle(t)}
            aria-pressed={selected}
            title={t.telescopeName}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 border px-2 py-1.5 text-left transition-colors",
              selected
                ? "border-primary bg-primary/10 ring-1 ring-primary"
                : "border-border bg-card hover:border-primary/50",
              dragging && "opacity-50",
              isOver && "border-sky-300",
            )}
          >
            <span
              role="button"
              tabIndex={-1}
              aria-label={`Reorder ${t.telescopeName}`}
              onPointerDown={(e) => handleGripDown(e, i)}
              onClick={(e) => e.stopPropagation()}
              className="flex size-5 shrink-0 touch-none cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
            >
              <GripVertical className="size-3.5" />
            </span>
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
      })}
    </div>
  )
}
