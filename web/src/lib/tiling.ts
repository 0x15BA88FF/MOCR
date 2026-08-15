export type TilingNode = TilingLeaf | TilingSplit;

export interface TilingLeaf {
  kind: "leaf";
  id: string;
}

export interface TilingSplit {
  kind: "split";
  direction: "row" | "column";
  children: TilingNode[];
}

export function buildGridTiling(
  ids: readonly string[],
  maxRows: number,
): TilingNode | null {
  const count = ids.length;
  if (count === 0) return null;
  if (count === 1) return { kind: "leaf", id: ids[0] };

  const cols = count <= maxRows ? count : Math.ceil(count / maxRows);
  const full = count <= maxRows ? 1 : maxRows;
  const heights = Array.from({ length: cols }, (_, j) =>
    j < cols - 1 ? full : count - full * (cols - 1),
  );

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
        };

  let offset = 0;
  return {
    kind: "split",
    direction: "row",
    children: heights.map((h) => {
      const node = column(h, offset);
      offset += h;
      return node;
    }),
  };
}

