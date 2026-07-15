import { localToWorldPoint } from '@/lib/drawingTransform';
import type { DrawingObject, DrawingObjectStyle, DrawingPoint, DrawingTableLayoutFields, DrawingTableLocalTarget, DrawingTableTextOffsets, DrawingTableTextSize } from '@/types/drawing';

export type DrawingTableObject = Extract<DrawingObject, { kind: 'table' | 'bom-table' | 'wiring-table' }>;
export type ResolvedDrawingTableLayout = Required<Omit<DrawingTableLayoutFields, 'textSizes'>> & { textSizes: Record<string, DrawingTableTextSize> };
export type DrawingTablePatch = Partial<Pick<DrawingTableObject, 'x' | 'y' | 'width' | 'height'>> & DrawingTableLayoutFields & {
  style?: DrawingObjectStyle;
  textOffsets?: DrawingTableTextOffsets;
};

export const DEFAULT_TITLE_ROW_HEIGHT = 22;
export const DEFAULT_TABLE_ROW_HEIGHT = 18;
export const MIN_TABLE_COLUMN_WIDTH = 28;
export const MIN_TABLE_ROW_HEIGHT = 16;
export const MIN_TABLE_FONT_SIZE = 8;

function normalizedSizes(values: number[] | undefined, length: number, fallback: number, minimum: number): number[] {
  return Array.from({ length }, (_, index) => Math.max(minimum, values?.[index] ?? fallback));
}

export function resolveDrawingTableLayout(table: DrawingTableObject): ResolvedDrawingTableLayout {
  const columnCount = Math.max(1, table.columns.length);
  return {
    showTitleRow: table.showTitleRow ?? true,
    columnWidths: normalizedSizes(table.columnWidths, columnCount, table.width / columnCount, MIN_TABLE_COLUMN_WIDTH),
    titleRowHeight: Math.max(MIN_TABLE_ROW_HEIGHT, table.titleRowHeight ?? DEFAULT_TITLE_ROW_HEIGHT),
    headerRowHeight: Math.max(MIN_TABLE_ROW_HEIGHT, table.headerRowHeight ?? DEFAULT_TABLE_ROW_HEIGHT),
    rowHeights: normalizedSizes(table.rowHeights, table.rows.length, DEFAULT_TABLE_ROW_HEIGHT, MIN_TABLE_ROW_HEIGHT),
    textSizes: { ...table.textSizes },
  };
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
  const column = columnBounds(table, target.columnIndex);
  const row = rowBounds(table, target.key === 'title' ? undefined : target.rowIndex);
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
    columnWidths: layout.columnWidths.map((value) => value * factor),
    titleRowHeight: layout.titleRowHeight * factor,
    headerRowHeight: layout.headerRowHeight * factor,
    rowHeights: layout.rowHeights.map((value) => value * factor),
    textOffsets: scaleOffsets(table.textOffsets, factor),
    textSizes: Object.fromEntries(Object.entries(layout.textSizes).map(([key, size]) => [key, { width: size.width * factor, height: size.height * factor, fontSize: size.fontSize * factor }])),
    style: { ...table.style, strokeWidth: table.style.strokeWidth * factor, fontSize: table.style.fontSize * factor },
  };
}
