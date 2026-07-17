import { MIN_OBJECT_SIZE, localToWorldPoint, resizeDrawingObject, type ResizeHandle } from '@/lib/drawingTransform';
import type { DrawingObject, DrawingObjectStyle, DrawingPoint, DrawingTableLayoutFields, DrawingTableLocalTarget, DrawingTableMerge, DrawingTableTextOffsets, DrawingTableTextSize } from '@/types/drawing';

export type DrawingTableObject = Extract<DrawingObject, { kind: 'table' | 'bom-table' | 'wiring-table' }>;
export type ResolvedDrawingTableLayout = {
  showTitleRow: boolean;
  columnWidths: number[];
  titleRowHeight: number;
  headerRowHeight: number;
  rowHeights: number[];
  textSizes: Record<string, DrawingTableTextSize>;
};
export type ResolvedDrawingTableCell = {
  key: string;
  value: string;
  rowIndex: number;
  columnIndex: number;
  rowSpan: number;
  columnSpan: number;
  x: number;
  y: number;
  width: number;
  height: number;
  header: boolean;
};
export type DrawingTablePatch = Partial<Pick<DrawingTableObject, 'x' | 'y' | 'width' | 'height'>> & DrawingTableLayoutFields & {
  style?: DrawingObjectStyle;
  textOffsets?: DrawingTableTextOffsets;
};
export type DrawingTableResizeResult = {
  patch: DrawingTablePatch;
  activeHandle: ResizeHandle;
};

export const DEFAULT_TITLE_ROW_HEIGHT = 22;
export const DEFAULT_TABLE_ROW_HEIGHT = 18;
export const MIN_TABLE_COLUMN_WIDTH = 28;
export const MIN_TABLE_ROW_HEIGHT = 16;
export const MIN_TABLE_FONT_SIZE = 8;

function normalizedSizes(values: number[] | undefined, length: number, fallback: number, minimum: number): number[] {
  return Array.from({ length }, (_, index) => Math.max(minimum, values?.[index] ?? fallback));
}

function fittedColumnWidths(
  values: number[] | undefined,
  length: number,
  fallback: number,
  minimum: number,
  totalWidth: number,
): number[] {
  const width = Math.max(1, totalWidth);
  const minimumWidth = Math.min(minimum, width / length);
  const sizes = normalizedSizes(values, length, fallback, minimumWidth);
  const flexibleSizes = sizes.map((size) => Math.max(0, size - minimumWidth));
  const flexibleTotal = flexibleSizes.reduce((sum, size) => sum + size, 0);
  const flexibleWidth = Math.max(0, width - minimumWidth * length);

  if (flexibleTotal === 0) return Array.from({ length }, () => width / length);
  return flexibleSizes.map((size) => minimumWidth + (size / flexibleTotal) * flexibleWidth);
}

export function resolveDrawingTableLayout(table: DrawingTableObject): ResolvedDrawingTableLayout {
  const columnCount = Math.max(1, table.columns.length);
  return {
    showTitleRow: table.showTitleRow ?? true,
    columnWidths: fittedColumnWidths(table.columnWidths, columnCount, table.width / columnCount, MIN_TABLE_COLUMN_WIDTH, table.width),
    titleRowHeight: Math.max(MIN_TABLE_ROW_HEIGHT, table.titleRowHeight ?? DEFAULT_TITLE_ROW_HEIGHT),
    headerRowHeight: Math.max(MIN_TABLE_ROW_HEIGHT, table.headerRowHeight ?? DEFAULT_TABLE_ROW_HEIGHT),
    rowHeights: normalizedSizes(table.rowHeights, table.rows.length, DEFAULT_TABLE_ROW_HEIGHT, MIN_TABLE_ROW_HEIGHT),
    textSizes: { ...table.textSizes },
  };
}

function estimateDrawingTextUnits(value: string): number {
  return Array.from(value).reduce((total, character) => total + (character.charCodeAt(0) <= 0xff ? 0.62 : 1), 0);
}

export function getDrawingTableTextFontSize(
  value: string,
  cellWidth: number,
  fallbackSize: number,
  horizontalPadding = 6,
): number {
  if (!value) return fallbackSize;
  const availableWidth = Math.max(1, cellWidth - horizontalPadding);
  const estimatedWidth = estimateDrawingTextUnits(value) * fallbackSize;
  return Math.max(4, Math.min(fallbackSize, availableWidth / Math.max(1, estimatedWidth) * fallbackSize));
}

function normalizeMerge(merge: DrawingTableMerge, columnCount: number, rowCount: number): DrawingTableMerge | null {
  if (merge.rowIndex < -1 || merge.rowIndex >= rowCount || merge.columnIndex < 0 || merge.columnIndex >= columnCount) return null;
  const availableRows = rowCount - merge.rowIndex;
  return {
    rowIndex: merge.rowIndex,
    columnIndex: merge.columnIndex,
    rowSpan: Math.max(1, Math.min(Math.floor(merge.rowSpan), availableRows)),
    columnSpan: Math.max(1, Math.min(Math.floor(merge.columnSpan), columnCount - merge.columnIndex)),
  };
}

export function resolveDrawingTableCells(table: DrawingTableObject): ResolvedDrawingTableCell[] {
  const layout = resolveDrawingTableLayout(table);
  const columnCount = layout.columnWidths.length;
  const rowCount = table.rows.length;
  const merges = (table.mergedCells ?? []).map((merge) => normalizeMerge(merge, columnCount, rowCount)).filter((merge): merge is DrawingTableMerge => Boolean(merge));
  const mergeAt = new Map(merges.map((merge) => [`${merge.rowIndex}:${merge.columnIndex}`, merge]));
  const covered = new Set<string>();
  merges.forEach((merge) => {
    for (let row = merge.rowIndex; row < merge.rowIndex + merge.rowSpan; row += 1) {
      for (let column = merge.columnIndex; column < merge.columnIndex + merge.columnSpan; column += 1) {
        if (row !== merge.rowIndex || column !== merge.columnIndex) covered.add(`${row}:${column}`);
      }
    }
  });
  const columnStarts = layout.columnWidths.map((_, index) => layout.columnWidths.slice(0, index).reduce((sum, width) => sum + width, 0));
  const titleHeight = layout.showTitleRow ? layout.titleRowHeight : 0;
  const rowHeight = (rowIndex: number) => rowIndex < 0 ? layout.headerRowHeight : layout.rowHeights[rowIndex];
  const rowStart = (rowIndex: number) => titleHeight + (rowIndex < 0 ? 0 : layout.headerRowHeight + layout.rowHeights.slice(0, rowIndex).reduce((sum, height) => sum + height, 0));
  const cells: ResolvedDrawingTableCell[] = [];
  for (let rowIndex = -1; rowIndex < rowCount; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      if (covered.has(`${rowIndex}:${columnIndex}`)) continue;
      const merge = mergeAt.get(`${rowIndex}:${columnIndex}`);
      const rowSpan = merge?.rowSpan ?? 1;
      const columnSpan = merge?.columnSpan ?? 1;
      const key = rowIndex < 0 ? `column-${columnIndex}` : `row-${rowIndex}-column-${columnIndex}`;
      cells.push({
        key,
        value: rowIndex < 0 ? table.columns[columnIndex] ?? '' : table.rows[rowIndex]?.[table.columnKeys?.[columnIndex] ?? table.columns[columnIndex]] ?? '',
        rowIndex,
        columnIndex,
        rowSpan,
        columnSpan,
        x: columnStarts[columnIndex],
        y: rowStart(rowIndex),
        width: layout.columnWidths.slice(columnIndex, columnIndex + columnSpan).reduce((sum, width) => sum + width, 0),
        height: Array.from({ length: rowSpan }, (_, offset) => rowHeight(rowIndex + offset)).reduce((sum, height) => sum + height, 0),
        header: rowIndex < 0,
      });
    }
  }
  return cells;
}

function rowBounds(table: DrawingTableObject, rowIndex: number | undefined) {
  const layout = resolveDrawingTableLayout(table);
  const titleHeight = layout.showTitleRow ? layout.titleRowHeight : 0;
  if (rowIndex === undefined) return { y: 0, height: layout.titleRowHeight };
  if (rowIndex < 0) return { y: titleHeight, height: layout.headerRowHeight };
  return {
    y: titleHeight + layout.headerRowHeight + layout.rowHeights.slice(0, rowIndex).reduce((sum, value) => sum + value, 0),
    height: layout.rowHeights[rowIndex] ?? DEFAULT_TABLE_ROW_HEIGHT,
  };
}

function columnBounds(table: DrawingTableObject, columnIndex: number | undefined) {
  const layout = resolveDrawingTableLayout(table);
  if (columnIndex === undefined) return { x: 0, width: table.width };
  return {
    x: layout.columnWidths.slice(0, columnIndex).reduce((sum, value) => sum + value, 0),
    width: layout.columnWidths[columnIndex] ?? MIN_TABLE_COLUMN_WIDTH,
  };
}

export function getDrawingTableTargetObject(table: DrawingTableObject, target: DrawingTableLocalTarget): DrawingObject {
  const mergedCell = target.key === 'title' ? undefined : resolveDrawingTableCells(table).find((cell) => cell.key === target.key);
  const column = mergedCell ? { x: mergedCell.x, width: mergedCell.width } : columnBounds(table, target.columnIndex);
  const row = mergedCell ? { y: mergedCell.y, height: mergedCell.height } : rowBounds(table, target.key === 'title' ? undefined : target.rowIndex);
  const offset = table.textOffsets?.[target.key] ?? { x: 0, y: 0 };
  const configuredText = table.textSizes?.[target.key];
  const inset = target.kind === 'table-text' ? 5 : 0;
  const localX = column.x + inset + (target.kind === 'table-text' ? offset.x : 0);
  const localY = row.y + (target.kind === 'table-text' ? offset.y : 0);
  const width = target.kind === 'table-text' ? configuredText?.width ?? Math.max(1, column.width - inset * 2) : column.width;
  const height = target.kind === 'table-text' ? configuredText?.height ?? row.height : row.height;
  const center = localToWorldPoint(table, { x: localX + width / 2, y: localY + height / 2 });
  return {
    ...table,
    id: `${table.id}:${target.key}`,
    kind: 'text',
    text: '',
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
    style: { ...table.style, fontSize: configuredText?.fontSize ?? table.style.fontSize },
  };
}

export function resizeDrawingTableCell(
  table: DrawingTableObject,
  target: { rowIndex: number; columnIndex: number },
  size: { width: number; height: number },
): DrawingTablePatch {
  const layout = resolveDrawingTableLayout(table);
  layout.columnWidths[target.columnIndex] = Math.max(MIN_TABLE_COLUMN_WIDTH, size.width);
  if (target.rowIndex < 0) layout.headerRowHeight = Math.max(MIN_TABLE_ROW_HEIGHT, size.height);
  else layout.rowHeights[target.rowIndex] = Math.max(MIN_TABLE_ROW_HEIGHT, size.height);
  return {
    width: layout.columnWidths.reduce((sum, value) => sum + value, 0),
    height: (layout.showTitleRow ? layout.titleRowHeight : 0) + layout.headerRowHeight + layout.rowHeights.reduce((sum, value) => sum + value, 0),
    columnWidths: layout.columnWidths,
    titleRowHeight: layout.titleRowHeight,
    headerRowHeight: layout.headerRowHeight,
    rowHeights: layout.rowHeights,
  };
}

export function resizeDrawingTableText(table: DrawingTableObject, key: string, size: DrawingTableTextSize): DrawingTablePatch {
  return {
    textSizes: {
      ...table.textSizes,
      [key]: {
        width: Math.max(1, size.width),
        height: Math.max(1, size.height),
        fontSize: Math.max(MIN_TABLE_FONT_SIZE, size.fontSize),
      },
    },
  };
}

function scaleOffsets(offsets: DrawingTableTextOffsets | undefined, factor: number): DrawingTableTextOffsets | undefined {
  if (!offsets) return undefined;
  return Object.fromEntries(Object.entries(offsets).map(([key, point]) => [key, { x: point.x * factor, y: point.y * factor } as DrawingPoint]));
}

export function scaleDrawingTable(table: DrawingTableObject, factor: number): DrawingTablePatch {
  const layout = resolveDrawingTableLayout(table);
  const width = table.width * factor;
  const height = table.height * factor;
  const center = { x: table.x + table.width / 2, y: table.y + table.height / 2 };
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
    columnWidths: layout.columnWidths.map((value, index) => (table.columnWidths?.[index] ?? value) * factor),
    titleRowHeight: (table.titleRowHeight ?? layout.titleRowHeight) * factor,
    headerRowHeight: (table.headerRowHeight ?? layout.headerRowHeight) * factor,
    rowHeights: layout.rowHeights.map((value, index) => (table.rowHeights?.[index] ?? value) * factor),
    textOffsets: scaleOffsets(table.textOffsets, factor),
    textSizes: Object.fromEntries(Object.entries(layout.textSizes).map(([key, size]) => [key, { width: size.width * factor, height: size.height * factor, fontSize: size.fontSize * factor }])),
    style: { ...table.style, strokeWidth: table.style.strokeWidth * factor, fontSize: table.style.fontSize * factor },
  };
}

function getOppositeHandleAnchor(handle: ResizeHandle, width: number, height: number): DrawingPoint {
  return {
    x: handle.includes('w') ? width : handle.includes('e') ? 0 : width / 2,
    y: handle.includes('n') ? height : handle.includes('s') ? 0 : height / 2,
  };
}

export function resizeDrawingTableFromHandle(
  table: DrawingTableObject,
  handle: ResizeHandle,
  pointer: DrawingPoint,
): DrawingTableResizeResult {
  const frame = resizeDrawingObject(table, handle, pointer, handle.length === 2);
  const widthFactor = (frame.patch.width ?? table.width) / table.width;
  const heightFactor = (frame.patch.height ?? table.height) / table.height;
  const requestedFactor = handle === 'e' || handle === 'w'
    ? widthFactor
    : handle === 'n' || handle === 's'
      ? heightFactor
      : Math.max(widthFactor, heightFactor);
  const factor = Math.max(requestedFactor, MIN_OBJECT_SIZE / table.width, MIN_OBJECT_SIZE / table.height);
  const patch = scaleDrawingTable(table, factor);
  const fixedBefore = localToWorldPoint(table, getOppositeHandleAnchor(handle, table.width, table.height));
  const scaledTable = { ...table, ...patch } as DrawingTableObject;
  const fixedAfter = localToWorldPoint(scaledTable, getOppositeHandleAnchor(frame.activeHandle, scaledTable.width, scaledTable.height));

  return {
    patch: {
      ...patch,
      x: (patch.x ?? table.x) + fixedBefore.x - fixedAfter.x,
      y: (patch.y ?? table.y) + fixedBefore.y - fixedAfter.y,
    },
    activeHandle: frame.activeHandle,
  };
}
