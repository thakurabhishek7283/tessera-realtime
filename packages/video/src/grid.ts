export interface GridLayout {
  columns: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
}

/**
 * Chooses the number of columns that gives the largest 16:9 tiles for `count` tiles in a
 * `width` × `height` area (minus `gap` between tiles).
 */
export function computeGrid(
  count: number,
  width: number,
  height: number,
  gap = 8,
  aspect = 16 / 9,
): GridLayout {
  if (count <= 0 || width <= 0 || height <= 0) {
    return { columns: 1, rows: 1, tileWidth: 0, tileHeight: 0 };
  }
  let best: GridLayout = { columns: 1, rows: count, tileWidth: 0, tileHeight: 0 };
  let bestArea = -1;
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const cellW = (width - gap * (columns - 1)) / columns;
    const cellH = (height - gap * (rows - 1)) / rows;
    const tileWidth = Math.max(0, Math.min(cellW, cellH * aspect));
    const tileHeight = tileWidth / aspect;
    const area = tileWidth * tileHeight;
    if (area > bestArea + 1e-6) {
      bestArea = area;
      best = {
        columns,
        rows,
        tileWidth: Math.floor(tileWidth),
        tileHeight: Math.floor(tileHeight),
      };
    }
  }
  return best;
}
