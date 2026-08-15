import type { ReactNode } from "react"
import type { PointerEvent } from "react"
import type { SloohTelescope } from "@/lib/slooh"
import type { TilingNode } from "@/lib/tiling"
import type { FrameMeta } from "./frame/types"
import { Frame, type FrameProps } from "./frame/Frame"

const subtreeKey = (node: TilingNode): string =>
  node.kind === "leaf" ? node.id : node.children.map(subtreeKey).join("|")

export interface FrameGridProps {
  tree: TilingNode | null
  telescopesById: Map<string, SloohTelescope>
  latest: Record<string, FrameMeta>
  activeAudioTeleId: string | null
  activeAudioURL: string | null
  dragId: string | null
  overId: string | null
  focusedIds: Record<string, boolean>
  showHud: boolean
  infoId: string | null
  refreshKeys: Record<string, number>
  onToggleAudio: (teleUniqueId: string) => void
  onRefreshFrame: (id: string) => void
  onToggleInfo: (id: string) => void
  onToggleFocus: (id: string) => void
  onCaptured: (customerImageId: number | null) => void
  onPointerDown: (e: PointerEvent<HTMLElement>, id: string) => void
  onPointerMove: (e: PointerEvent<HTMLDivElement>) => void
  onPointerUp: () => void
  onPointerCancel: () => void
}

export function FrameGrid({
  tree,
  telescopesById,
  latest,
  activeAudioTeleId,
  activeAudioURL,
  dragId,
  overId,
  focusedIds,
  showHud,
  infoId,
  refreshKeys,
  onToggleAudio,
  onRefreshFrame,
  onToggleInfo,
  onToggleFocus,
  onCaptured,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: FrameGridProps): ReactNode {
  const renderNode = (node: TilingNode): ReactNode => {
    if (node.kind === "leaf") {
      const telescope = telescopesById.get(node.id) ?? null
      const meta = telescope ? latest[telescope.teleUniqueId] : undefined
      const currentImgURL = telescope
        ? meta?.url ?? telescope.currentImgURL ?? null
        : null
      const mission = telescope ? (meta ?? telescope.mission) : null
      const object = telescope?.object ?? null
      const isAudioActive = activeAudioTeleId === telescope?.teleUniqueId
      const audioState: "muted" | "waiting" | "playing" = !isAudioActive
        ? "muted"
        : activeAudioURL
          ? "playing"
          : "waiting"
      const frameProps: FrameProps = {
        id: node.id,
        telescope,
        currentImgURL,
        mission,
        object,
        dragging: dragId === node.id,
        highlighted: overId === node.id,
        focused: focusedIds[node.id] ?? false,
        showHud,
        infoOpen: infoId === node.id,
        refreshKey: refreshKeys[node.id] ?? 0,
        audioState,
        onToggleAudio: () => telescope && onToggleAudio(telescope.teleUniqueId),
        onRefresh: () => onRefreshFrame(node.id),
        onToggleInfo: () => onToggleInfo(node.id),
        onToggleFocus: () => onToggleFocus(node.id),
        onCaptured,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel,
      }
      return <Frame key={node.id} {...frameProps} />
    }

    return (
      <div
        key={`${node.direction}-${subtreeKey(node)}`}
        className="flex min-h-0 min-w-0 flex-1 gap-2"
        style={{ flexDirection: node.direction }}
      >
        {node.children.map(renderNode)}
      </div>
    )
  }

  if (!tree) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-sm text-muted-foreground">
          select telescopes from the sidebar to open their feeds
        </span>
      </div>
    )
  }
  return renderNode(tree)
}
