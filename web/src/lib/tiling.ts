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

// Direction in which items fill within a line before moving to the next line.
//   "column": items stack vertically, lines sit side by side (landscape default)
//   "row":    items stack horizontally, lines stack vertically (portrait default)
export type FillDirection = "row" | "column";

// User-facing layout preference. "auto" resolves to a direction based on the
// device that loads the page (portrait -> row fill, otherwise column fill).
export type GridLayout = "auto" | "landscape" | "portrait";

export function resolveFillDirection(
  layout: GridLayout,
  isPortrait: boolean,
): FillDirection {
  if (layout === "portrait") return "row";
  if (layout === "landscape") return "column";
  return isPortrait ? "row" : "column";
}

// Pick a rows x columns grid that fits `count` items, respecting the
// maxRows / maxCols caps. `fill` decides whether items fill column-major
// (down then right) or row-major (right then down). Returns the number of
// lines (columns for column-major, rows for row-major) and the items per line.
function computeGrid(
  count: number,
  maxRows: number,
  maxCols: number,
  fill: FillDirection,
): { lines: number; perLine: number; rows: number; columns: number } {
  const rows = Math.max(1, maxRows);
  const cols = Math.max(1, maxCols);
  if (fill === "column") {
    const columns = Math.min(cols, count <= rows ? count : Math.ceil(count / rows));
    const perLine = Math.ceil(count / columns);
    return { lines: columns, perLine, rows: perLine, columns };
  }
  const perLine = Math.min(cols, count <= rows ? count : Math.ceil(count / rows));
  const lines = Math.ceil(count / perLine);
  return { lines, perLine, rows: lines, columns: perLine };
}

export function chunkWorkspaces(
  ids: readonly string[],
  maxRows: number,
  maxCols: number,
): string[][] {
  const per = Math.max(1, maxRows * maxCols);
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += per) {
    out.push(ids.slice(i, i + per));
  }
  return out;
}

export function buildGridTiling(
  ids: readonly string[],
  maxRows: number,
  maxCols: number,
  fill: FillDirection = "column",
): TilingNode | null {
  const count = ids.length;
  if (count === 0) return null;
  if (count === 1) return { kind: "leaf", id: ids[0] };

  const { lines, perLine } = computeGrid(count, maxRows, maxCols, fill);
  const crossDirection: "row" | "column" = fill === "column" ? "row" : "column";

  const lineNodes: TilingSplit[] = [];
  let offset = 0;
  for (let k = 0; k < lines; k++) {
    const size = Math.min(perLine, count - offset);
    const children = Array.from({ length: size }, (_, i) => ({
      kind: "leaf" as const,
      id: ids[offset + i],
    }));
    offset += size;
    lineNodes.push({ kind: "split", direction: fill, children });
  }

  if (lineNodes.length === 1) return lineNodes[0];

  return {
    kind: "split",
    direction: crossDirection,
    children: lineNodes,
  };
}
