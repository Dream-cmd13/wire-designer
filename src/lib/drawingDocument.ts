import type {
  DrawingDocument,
  DrawingObject,
  DrawingObjectStyle,
  DrawingPoint,
  DrawingResourceKind,
  DrawingTableObject,
  DrawingTitleBlockObject,
} from '@/types/drawing';

export const DRAWING_PAGE = {
  size: 'A4' as const,
  orientation: 'landscape' as const,
  width: 1200 as const,
  height: 800 as const,
};

export const defaultDrawingObjectStyle: DrawingObjectStyle = {
  fill: '#ffffff',
  stroke: '#111827',
  strokeWidth: 1,
  fontSize: 12,
  color: '#111827',
};

export function createDrawingId(prefix = 'drawing'): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

function cloneStyle(): DrawingObjectStyle {
  return { ...defaultDrawingObjectStyle };
}

function createTitleBlock(name: string): DrawingTitleBlockObject {
  return {
    id: createDrawingId('title-block'),
    kind: 'title-block',
    x: 800,
    y: 705,
    width: 320,
    height: 60,
    rotation: 0,
    zIndex: 1,
    locked: false,
    visible: false,
    style: cloneStyle(),
    title: name,
    drawingNo: 'WH-NEW',
    revision: 'A',
  };
}

export function formatDrawingDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

function createRevisionTable(date: Date): DrawingObject {
  return {
    ...objectBase('table', { x: 840, y: 48 }, 320, 60),
    kind: 'table',
    title: '变更记录',
    columns: ['版本', '变更内容', '日期', '变更者'],
    rows: [
      { 版本: 'A', 变更内容: '新版发行', 日期: formatDrawingDate(date), 变更者: '' },
      { 版本: '', 变更内容: '', 日期: '', 变更者: '' },
    ],
    showTitleRow: false,
    tableRole: 'revision',
    columnWidths: [50, 130, 90, 50],
    headerRowHeight: 20,
    rowHeights: [20, 20],
  };
}

function createTitleInformationTable(drawingNo: string, date: Date): DrawingObject {
  const columns = ['xxx公司', '', '', '', '', '品名', '', '', ''];
  return {
    ...objectBase('table', { x: 820, y: 640 }, 360, 124),
    kind: 'table',
    title: '标题栏',
    columns,
    columnKeys: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'],
    rows: [
      { C1: '版本', C2: 'A', C3: '绘制', C4: '', C5: formatDrawingDate(date), C6: '料号', C7: '', C8: '', C9: '' },
      { C1: '图幅', C2: 'A4', C3: '审查', C4: '', C5: '', C6: '客户料号', C7: '', C8: '', C9: '' },
      { C1: '', C2: '', C3: '核准', C4: '', C5: '', C6: '单位', C7: 'mm', C8: '比例', C9: 'none' },
      { C1: '', C2: '', C3: '工程图号', C4: drawingNo, C5: '', C6: '页次', C7: '1 of 1', C8: '', C9: '' },
    ],
    showTitleRow: false,
    tableRole: 'title-block',
    columnWidths: [40, 40, 48, 42, 58, 52, 26, 28, 26],
    headerRowHeight: 28,
    rowHeights: [24, 24, 24, 24],
    mergedCells: [
      { rowIndex: -1, columnIndex: 0, rowSpan: 1, columnSpan: 5 },
      { rowIndex: -1, columnIndex: 5, rowSpan: 1, columnSpan: 4 },
      { rowIndex: 0, columnIndex: 6, rowSpan: 1, columnSpan: 3 },
      { rowIndex: 1, columnIndex: 6, rowSpan: 1, columnSpan: 3 },
      { rowIndex: 2, columnIndex: 0, rowSpan: 2, columnSpan: 2 },
      { rowIndex: 3, columnIndex: 3, rowSpan: 1, columnSpan: 2 },
      { rowIndex: 3, columnIndex: 6, rowSpan: 1, columnSpan: 3 },
    ],
    projectionCellKey: 'row-2-column-0',
  };
}

export function createWiringTable(): DrawingObject {
  return {
    ...objectBase('wiring-table', { x: 600, y: 430 }, 520, 94),
    kind: 'wiring-table',
    title: '接线表',
    columns: ['P1', '颜色', 'P2', '长度'],
    rows: [{ P1: '黑', 颜色: '1', P2: '黑', 长度: '2' }],
  };
}

function createBomTable(): DrawingObject {
  return {
    ...objectBase('bom-table', { x: 40, y: 740 }, 720, 24),
    kind: 'bom-table',
    title: '物料表',
    columns: ['序号', '物料编码', '物料名称/规格', '单位', '用量', '备注'],
    rows: [],
    showTitleRow: false,
    tableRole: 'bom',
    columnWidths: [50, 120, 260, 70, 70, 150],
    headerRowHeight: 24,
    rowHeights: [],
  };
}

export function createBlankDrawingDocument(name = '未命名线束图', date = new Date()): DrawingDocument {
  const now = Date.now();
  const titleBlock = createTitleBlock(name);
  return {
    schemaVersion: 1,
    id: createDrawingId(),
    name,
    createdAt: now,
    updatedAt: now,
    page: { ...DRAWING_PAGE },
    objects: [titleBlock, createBomTable(), createRevisionTable(date), createTitleInformationTable(titleBlock.drawingNo, date)],
    titleBlock: {
      title: titleBlock.title,
      drawingNo: titleBlock.drawingNo,
      revision: titleBlock.revision,
    },
    revisionTable: [],
    techRequirements: [],
  };
}

function syncDocumentFields(document: DrawingDocument, object: DrawingObject): DrawingDocument {
  if (object.kind === 'title-block') {
    return {
      ...document,
      name: object.title || document.name,
      titleBlock: {
        title: object.title,
        drawingNo: object.drawingNo,
        revision: object.revision,
      },
    };
  }
  if (object.kind === 'tech-requirements') {
    return { ...document, techRequirements: object.requirements };
  }
  return document;
}

export function patchDrawingObject(
  document: DrawingDocument,
  objectId: string,
  patch: Partial<DrawingObject>,
): DrawingDocument {
  const current = document.objects.find((object) => object.id === objectId);
  if (!current) return document;
  if (current.locked && patch.locked !== false) return document;

  let updatedObject: DrawingObject | undefined;
  const objects = document.objects.map((object) => {
    if (object.id !== objectId) return object;
    updatedObject = {
      ...object,
      ...patch,
      style: patch.style ? { ...object.style, ...patch.style } : object.style,
    } as DrawingObject;
    return updatedObject;
  });
  if (!updatedObject) return document;

  const next = syncDocumentFields({
    ...document,
    updatedAt: Date.now(),
    objects,
  }, updatedObject);
  return next;
}

function objectBase(kind: DrawingResourceKind, point: DrawingPoint, width: number, height: number) {
  return {
    id: createDrawingId(kind),
    x: point.x,
    y: point.y,
    width,
    height,
    rotation: 0,
    zIndex: 10,
    locked: false,
    visible: true,
    style: cloneStyle(),
  };
}

export function createDrawingResourceObject(kind: DrawingResourceKind, point: DrawingPoint): DrawingObject {
  if (kind === 'connector') {
    return { ...objectBase(kind, point, 150, 230), kind: 'connector', label: '连接器', pinCount: 2, gender: 'receptacle', side: 'none' };
  }
  if (kind === 'wire-bundle') {
    return { ...objectBase(kind, point, 280, 90), kind: 'wire-bundle', label: '线束', wireCount: 2, wireKind: 'electronic', style: { ...cloneStyle(), fill: '#f1f5f9' } };
  }
  if (kind === 'accessory') {
    return { ...objectBase(kind, point, 110, 45), kind: 'accessory', label: '辅材', accessoryType: 'sleeve', style: { ...cloneStyle(), fill: '#e2e8f0' } };
  }
  if (kind === 'text' || kind === 'label') {
    return { ...objectBase(kind, point, 180, 28), kind, text: kind === 'label' ? '①' : '自定义文字' };
  }
  if (kind === 'dimension') {
    return { ...objectBase(kind, point, 240, 45), kind: 'dimension', label: '±5mm', start: point, end: { x: point.x + 240, y: point.y } };
  }
  if (kind === 'line' || kind === 'polyline' || kind === 'curve' || kind === 'freehand') {
    return {
      ...objectBase(kind, point, 200, 60),
      kind,
      points: [{ x: point.x, y: point.y + 30 }, { x: point.x + 200, y: point.y + 30 }],
      orthogonal: false,
    };
  }
  if (kind === 'table') return createDrawingTableObject(point, { rowCount: 3, columnCount: 3, showTitleRow: true });
  if (kind === 'bom-table' || kind === 'wiring-table') {
    const title = kind === 'bom-table' ? '物料表' : kind === 'wiring-table' ? '接线表' : '自定义表格';
    const base = objectBase(kind, point, 360, 120);
    const columns = kind === 'wiring-table' ? ['PIN', '颜色', '线号', '长度'] : ['序号', '名称', '数量'];
    const rows = Array.from({ length: 3 }, () =>
      Object.fromEntries(columns.map((column) => [column, ''])));
    if (kind === 'bom-table') return { ...base, kind: 'bom-table', title, columns, rows };
    return { ...base, kind: 'wiring-table', title, columns, rows };
  }
  return { ...objectBase(kind, point, 360, 120), kind: 'tech-requirements', requirements: ['请填写技术要求。'] };
}

export type DrawingTableCreateInput = { rowCount: number; columnCount: number; showTitleRow: boolean };

export function createDrawingTableObject(point: DrawingPoint, input: DrawingTableCreateInput): DrawingTableObject {
  const columns = Array.from({ length: input.columnCount }, (_, index) => `列${index + 1}`);
  const rows = Array.from({ length: input.rowCount }, () => Object.fromEntries(columns.map((column) => [column, ''])));
  const width = Math.max(180, input.columnCount * 90);
  const height = (input.showTitleRow ? 22 : 0) + 18 + input.rowCount * 18;
  return {
    ...objectBase('table', point, width, height),
    kind: 'table',
    title: '表格',
    columns,
    rows,
    showTitleRow: input.showTitleRow,
    columnWidths: Array.from({ length: input.columnCount }, () => width / input.columnCount),
    titleRowHeight: 22,
    headerRowHeight: 18,
    rowHeights: Array.from({ length: input.rowCount }, () => 18),
  };
}
