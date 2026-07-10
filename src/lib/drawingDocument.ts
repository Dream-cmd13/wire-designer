import type {
  DrawingDocument,
  DrawingObject,
  DrawingObjectStyle,
  DrawingPoint,
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

function createRevisionTable(): DrawingObject {
  return {
    ...objectBase('table', { x: 840, y: 48 }, 320, 76),
    kind: 'table',
    title: '变更记录',
    columns: ['版本', '变更内容', '日期', '变更者'],
    rows: [{ 版本: 'A', 变更内容: '新版发行', 日期: '2026.07.10', 变更者: '' }],
  };
}

function createTitleInformationTable(drawingNo: string): DrawingObject {
  return {
    ...objectBase('table', { x: 820, y: 615 }, 340, 150),
    kind: 'table',
    title: 'XXx公司',
    columns: ['字段', '内容', '字段（续）', '内容（续）'],
    rows: [
      { 字段: '品名', 内容: '', 字段_2: '版本', 内容_2: 'A' },
      { 字段: '绘制', 内容: '2026.07.10', 字段_2: '料号', 内容_2: '' },
      { 字段: '图副', 内容: 'A4', 字段_2: '审查', 内容_2: '' },
      { 字段: '客户料号', 内容: '', 字段_2: '核准', 内容_2: '' },
      { 字段: '单位', 内容: 'mm', 字段_2: '比例', 内容_2: 'none' },
      { 字段: '工程图号', 内容: drawingNo, 字段_2: '页次', 内容_2: '1 of 1' },
    ].map((row) => ({
      字段: row.字段,
      内容: row.内容,
      '字段（续）': row.字段_2,
      '内容（续）': row.内容_2,
    })),
  };
}

function createWiringTable(): DrawingObject {
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
    ...objectBase('bom-table', { x: 48, y: 650 }, 710, 115),
    kind: 'bom-table',
    title: 'BOM表',
    columns: ['序号', '物料编码', '物料名称/规格', '单位', '用量', '备注'],
    rows: [{
      序号: '①',
      物料编码: '',
      '物料名称/规格': 'AC电源插座C20公座-1俯面',
      单位: 'PCS',
      用量: '1',
      备注: '',
    }],
  };
}

export function createBlankDrawingDocument(name = '未命名线束图'): DrawingDocument {
  const now = Date.now();
  const titleBlock = createTitleBlock(name);
  return {
    schemaVersion: 1,
    id: createDrawingId(),
    name,
    createdAt: now,
    updatedAt: now,
    page: { ...DRAWING_PAGE },
    objects: [titleBlock, createRevisionTable(), createWiringTable(), createBomTable(), createTitleInformationTable(titleBlock.drawingNo)],
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

type DrawingResourceKind = Exclude<DrawingObject['kind'], 'title-block'>;

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
  if (kind === 'table' || kind === 'bom-table' || kind === 'wiring-table') {
    const title = kind === 'bom-table' ? '物料表' : kind === 'wiring-table' ? '接线表' : '自定义表格';
    const base = objectBase(kind, point, 360, 120);
    const columns = kind === 'wiring-table' ? ['PIN', '颜色', '线号', '长度'] : ['序号', '名称', '数量'];
    const rows = Array.from({ length: 3 }, () =>
      Object.fromEntries(columns.map((column) => [column, ''])));
    if (kind === 'table') return { ...base, kind: 'table', title, columns, rows };
    if (kind === 'bom-table') return { ...base, kind: 'bom-table', title, columns, rows };
    return { ...base, kind: 'wiring-table', title, columns, rows };
  }
  return { ...objectBase(kind, point, 360, 120), kind: 'tech-requirements', requirements: ['请填写技术要求。'] };
}
