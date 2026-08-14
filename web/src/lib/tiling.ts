export type TilingNode = TilingLeaf | TilingSplit

export interface TilingLeaf {
  kind: "leaf"
  id: string
}

export interface TilingSplit {
  kind: "split"
  /** Flex direction: "row" lays children side by side, "column" stacks them. */
  direction: "row" | "column"
  children: TilingNode[]
}

/**
 * Builds an even grid tiling: windows fill columns left to right, each
 * column stacks up to `maxRows` windows. The grid never exceeds `maxRows`
 * rows and every column differs by at most one window.
 *
 * With maxRows = 2 the layouts morph as windows spawn:
 * 1 → 1:1 → 2:1 → 2:2 → 2:2:1 → 2:2:2
 */
export function buildGridTiling(ids: readonly string[], maxRows: number): TilingNode | null {
  const count = ids.length
  if (count === 0) return null
  if (count === 1) return { kind: "leaf", id: ids[0] }

  const cols = count <= maxRows ? count : Math.ceil(count / maxRows)
  const full = count <= maxRows ? 1 : maxRows
  const heights = Array.from({ length: cols }, (_, j) =>
    j < cols - 1 ? full : count - full * (cols - 1),
  )

  const column = (height: number, offset: number): TilingNode =>
    height === 1
      ? { kind: "leaf", id: ids[offset] }
      : {
          kind: "split",
          direction: "column",
          children: Array.from({ length: height }, (_, i) => ({
            kind: "leaf" as const,
            id: ids[offset + i],
          })),
        }

  let offset = 0
  return {
    kind: "split",
    direction: "row",
    children: heights.map((h) => {
      const node = column(h, offset)
      offset += h
      return node
    }),
  }
}