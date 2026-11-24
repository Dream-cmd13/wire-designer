import { Dwg_File_Type, LibreDwg, type DwgDatabase, type DwgEntity } from '@mlightcad/libredwg-web';
import { aciToRgb, rgbFromTrueColor, rgbToHex, type Rgb } from '@/lib/dwg/aciColor';
import { IDENTITY_AFFINE } from '@/lib/dwg/affine';
import { extendBounds, geometryBounds, type TextMeasure } from '@/lib/dwg/dwgBounds';
import { readEditableDwgText, type DwgEditOperation } from '@/lib/dwg/dwgEdit';
import {
  convertEntity,
  resolveLayerName,
  toPoint,
  wrapMTextLines,
  type BlockDefinition,
  type ConvertContext,
} from '@/lib/dwg/dwgGeometryConvert';
import type {
  DwgBounds,
  DwgDrawing,
  DwgEditSource,
  DwgLayerInfo,
  DwgRenderEntity,
} from '@/lib/dwg/dwgTypes';

export type { TextMeasure } from '@/lib/dwg/dwgBounds';
export type DwgParsePhase = 'engine' | 'parsing';

export interface ParseDwgOptions {
  fileName?: string;
  /** wasm 所在目录（浏览器中为 `${BASE_URL}libredwg`）；Node 环境可省略。 */
  wasmBase?: string;
  /**
   * 字体可用时传入真实测量函数（与渲染同一字体），使 MTEXT 折行、
   * Aligned/Fit 拉伸与文字包围盒基于实际字形宽度计算。
   */
  measureText?: TextMeasure;
  /**
   * 阶段回调；可返回 Promise，解析会等待其完成后继续，
   * 便于调用方在同步解析前先绘制加载遮罩。
   */
  onProgress?: (phase: DwgParsePhase) => void | Promise<void>;
}

const MODEL_SPACE_NAME = '*MODEL_SPACE';
const PAPER_SPACE_PREFIX = '*PAPER_SPACE';

/**
 * DWG 文件头版本标识检查（AC1.2 ~ AC1032 均以 AC + 数字开头）。
 */
export function hasDwgHeader(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 6) return false;
  const header = new TextDecoder('latin1').decode(new Uint8Array(buffer, 0, 6));
  return /^AC\d/.test(header);
}

let enginePromise: Promise<Awaited<ReturnType<typeof LibreDwg.create>>> | null = null;

function loadEngine(wasmBase?: string) {
  enginePromise ??= LibreDwg.create(wasmBase).catch((error: unknown) => {
    enginePromise = null;
    throw error;
  });
  return enginePromise;
}

export function previewDwgOperations(drawing: DwgDrawing, operations: DwgEditOperation[], measureText: TextMeasure | null = null): DwgDrawing {
  if (!operations.length) return drawing;
  const changes = new Map(operations.map((operation) => [operation.handle, operation]));
  let bounds = drawing.bounds;
  const entities = drawing.entities.map((entity) => {
    const source = entity.editSource;
    if (entity.kind !== 'text' || !source || source.readOnlyReason) return entity;
    const operation = changes.get(source.handle);
    if (!operation || operation.kind !== source.kind || operation.expectedText !== source.expectedText) return entity;
    const sourceLines = operation.newText.split('\n');
    const lines = wrapMTextLines(sourceLines, entity.wrapWidth ?? 0, entity.height, measureText);
    const next = { ...entity, lines, sourceLines };
    const nextBounds = geometryBounds(next, measureText);
    bounds = extendBounds(extendBounds(bounds, nextBounds.minX, nextBounds.minY), nextBounds.maxX, nextBounds.maxY);
    return { ...next, bounds: nextBounds };
  });
  return { ...drawing, entities, bounds };
}

/**
 * 将 libredwg 的 DwgDatabase 归一化为可直接渲染的图元列表（纯函数，便于测试）。
 */
export function normalizeDwgDatabase(
  db: DwgDatabase,
  fileName: string,
  options: { measureText?: TextMeasure; hasAssociativeDimensions?: boolean } = {},
): DwgDrawing {
  const layerColors = new Map<string, Rgb>();
  const layers: DwgLayerInfo[] = [];
  const hiddenLayers: string[] = [];
  for (const layer of db.tables?.LAYER?.entries ?? []) {
    const rgb = typeof layer.color === 'number' && layer.color > 0
      ? rgbFromTrueColor(layer.color)
      : aciToRgb(layer.colorIndex ?? 7);
    layerColors.set(layer.name, rgb);
    const off = layer.off === true;
    const frozen = layer.frozen === true;
    if (off || frozen) hiddenLayers.push(layer.name);
    layers.push({ name: layer.name, colorIndex: layer.colorIndex ?? 7, color: rgbToHex(rgb), off, frozen });
  }

  // LTYPE 表的虚线段：正负交替的实/空段，取绝对值转成 canvas 需要的正数序列
  const linePatterns = new Map<string, number[]>();
  for (const lineType of db.tables?.LTYPE?.entries ?? []) {
    const elements = (lineType.pattern ?? []).map((element) => Math.abs(element.elementLength ?? 0));
    if (elements.length > 0 && elements.some((length) => length > 0)) {
      linePatterns.set(lineType.name, elements);
    }
  }
  const layerLineTypes = new Map<string, string>();
  for (const layer of db.tables?.LAYER?.entries ?? []) {
    if (layer.lineType) layerLineTypes.set(layer.name, layer.lineType);
  }
  const headerLineTypeScale = db.header?.LTSCALE;
  const lineTypeScale = typeof headerLineTypeScale === 'number' && headerLineTypeScale > 0 ? headerLineTypeScale : 1;
  // IMAGEDEF 的图片路径：图片未内嵌时用于在边框内显示路径占位
  const imageDefPaths = new Map<string, string>();
  for (const imageDef of db.objects?.IMAGEDEF ?? []) {
    if (imageDef.handle && imageDef.fileName) imageDefPaths.set(imageDef.handle, imageDef.fileName);
  }

  const blocks = new Map<string, BlockDefinition>();
  const hasExternalDwgReference = (db.tables?.BLOCK_RECORD?.entries ?? []).some((record) => (record.flags & 28) !== 0);
  const paperSpaceHandles = new Set<string>();
  let modelSpaceEntities: DwgEntity[] | null = null;
  for (const record of db.tables?.BLOCK_RECORD?.entries ?? []) {
    blocks.set(record.name, {
      base: toPoint(record.basePoint) ?? { x: 0, y: 0 },
      entities: record.entities ?? [],
    });
    const upperName = record.name?.toUpperCase() ?? '';
    if (upperName === MODEL_SPACE_NAME && (record.entities?.length ?? 0) > 0) {
      modelSpaceEntities = record.entities;
    } else if (upperName.startsWith(PAPER_SPACE_PREFIX)) {
      paperSpaceHandles.add(record.handle);
    }
  }

  const context: ConvertContext = {
    transform: IDENTITY_AFFINE,
    layerColors,
    blocks,
    blockColor: null,
    blockLayer: null,
    blockLineType: null,
    linePatterns,
    layerLineTypes,
    lineTypeScale,
    imageDefPaths,
    externalImages: [],
    measureText: options.measureText ?? null,
    depth: 0,
  };

  const entities: DwgRenderEntity[] = [];
  const skipped: Record<string, number> = {};
  let textCount = 0;
  let bounds: DwgBounds | null = null;
  // 优先取模型空间块内容，避免把图纸空间（布局/视口）图元叠加到模型空间上；
  // 回退路径按 ownerBlockRecordSoftId 排除图纸空间块（libredwg-web 不填 isInPaperSpace）
  const allEntities = modelSpaceEntities
    ?? (db.entities ?? []).filter((entity) => (
      entity.isInPaperSpace !== true && !paperSpaceHandles.has(entity.ownerBlockRecordSoftId ?? '')
    ));

  // 顶层 INSERT 的属性文字由 INSERT 展开绘制；转换器并入 db.entities 的同一批属性按 handle 跳过，避免重复
  const expandedAttribHandles = new Set<string>();
  for (const entity of allEntities) {
    if (entity.type !== 'INSERT') continue;
    for (const attrib of (entity as DwgEntity & { attribs?: DwgEntity[] }).attribs ?? []) {
      if (attrib.handle) expandedAttribHandles.add(attrib.handle);
    }
  }

  const blockReferences = new Map<string, number>();
  const blockEntities = modelSpaceEntities ? [...blocks.values()].flatMap((block) => block.entities)
    : [...allEntities, ...[...blocks.values()].flatMap((block) => block.entities)];
  for (const entity of blockEntities) {
    const name = (entity as DwgEntity & { name?: string }).name?.toUpperCase();
    if (name && (entity.type === 'DIMENSION' || entity.type === 'INSERT' || entity.type === 'MINSERT')) {
      blockReferences.set(name, (blockReferences.get(name) ?? 0) + 1);
    }
  }
  const handleCounts = new Map<string, number>();
  for (const entity of allEntities) {
    const handle = entity.handle?.toUpperCase();
    if (handle) handleCounts.set(handle, (handleCounts.get(handle) ?? 0) + 1);
  }

  for (const entity of allEntities) {
    if (entity.isInPaperSpace === true) continue;
    if (entity.type === 'ATTRIB' && entity.handle && expandedAttribHandles.has(entity.handle)) continue;
    const geometries = convertEntity(entity, context);
    if (geometries.length === 0) {
      skipped[entity.type] = (skipped[entity.type] ?? 0) + 1;
      continue;
    }
    const layer = resolveLayerName(entity, context);
    const handle = entity.handle?.toUpperCase() ?? '';
    const sourceEntity = entity as DwgEntity & { text?: string; name?: string; columnType?: number; xDictionaryHardOwnerId?: string };
    let editSource: DwgEditSource | undefined;
    if (entity.type === 'TEXT' || entity.type === 'MTEXT' || entity.type === 'DIMENSION') {
      let multiline = entity.type !== 'TEXT';
      const visible = readEditableDwgText(sourceEntity.text, multiline);
      let readOnlyReason = !modelSpaceEntities || !/^[0-9A-F]{1,16}$/.test(handle) || handleCounts.get(handle) !== 1
        ? '无法唯一定位模型空间对象。' : undefined;
      if (visible === null || sourceEntity.columnType || sourceEntity.xDictionaryHardOwnerId) readOnlyReason ??= '自动字段、测量值或复杂文字格式仅支持预览。';
      if (hasExternalDwgReference) readOnlyReason = '包含外部 DWG 参照的图纸仅支持预览。';
      if (options.hasAssociativeDimensions) readOnlyReason = '当前写入器无法保全关联尺寸，图纸仅支持预览。';
      if (entity.type === 'DIMENSION') {
        const name = sourceEntity.name ?? '';
        const labels = blocks.get(name)?.entities.filter((part) => ['TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF'].includes(part.type)) ?? [];
        const label = labels[0] as (DwgEntity & { text?: string; columnType?: number }) | undefined;
        multiline = label?.type === 'MTEXT';
        if (!/^\*D[0-9]+$/i.test(name) || blockReferences.get(name.toUpperCase()) !== 1 || labels.length !== 1 ||
          !label || !['TEXT', 'MTEXT'].includes(label.type) || label.columnType ||
          readEditableDwgText(label.text, multiline) !== visible || geometries.filter((geometry) => geometry.kind === 'text').length !== 1) {
          readOnlyReason ??= '尺寸显示块共享或显示文字无法唯一定位。';
        }
      }
      editSource = {
        key: `${entity.type}:${handle || entities.length}`,
        handle, kind: entity.type, expectedText: visible ?? '', readOnlyReason, multiline,
      };
    }
    for (const geometry of geometries) {
      const entityBounds = geometryBounds(geometry, context.measureText);
      if (geometry.kind === 'text') textCount += 1;
      bounds = extendBounds(bounds, entityBounds.minX, entityBounds.minY);
      bounds = extendBounds(bounds, entityBounds.maxX, entityBounds.maxY);
      const source = editSource ?? (geometry.kind === 'text' && ['INSERT', 'MINSERT', 'ATTRIB'].includes(entity.type) ? {
        key: `block:${entities.length}`, handle, kind: 'BLOCK' as const, expectedText: geometry.lines.join('\n'),
        readOnlyReason: '共享块文字和块实例属性仅支持预览。',
      } : undefined);
      entities.push({ ...geometry, layer, bounds: entityBounds, ...(source ? { editSource: source } : {}) });
    }
  }

  // 只有没有任何可渲染图元时才回退到图纸头范围：部分图纸（如 M12A05-08-085）
  // 的 EXTMIN/EXTMAX 是过期的历史值，并入会把适应窗口缩小成正常尺寸的几分之一
  if (!bounds) {
    const headerMin = toPoint(db.header?.EXTMIN);
    const headerMax = toPoint(db.header?.EXTMAX);
    if (headerMin && headerMax && headerMax.x > headerMin.x && headerMax.y > headerMin.y) {
      bounds = { minX: headerMin.x, minY: headerMin.y, maxX: headerMax.x, maxY: headerMax.y };
    }
  }

  return {
    fileName,
    version: db.header?.ACADVER ?? '',
    units: db.header?.INSUNITS ?? null,
    bounds: bounds ?? { minX: 0, minY: 0, maxX: 100, maxY: 100 },
    layers,
    hiddenLayers,
    entities,
    externalImages: context.externalImages,
    stats: {
      total: allEntities.length,
      rendered: entities.length,
      text: textCount,
      skipped,
    },
  };
}

/**
 * 在浏览器内解析 DWG 文件，输出可直接渲染的归一化图元。
 */
export async function parseDwg(buffer: ArrayBuffer, options: ParseDwgOptions = {}): Promise<DwgDrawing> {
  const { fileName = 'drawing.dwg', wasmBase, measureText, onProgress } = options;

  if (!hasDwgHeader(buffer)) {
    throw new Error('该文件不是有效的 DWG 图纸（文件头校验失败）');
  }

  // 仅在引擎尚未创建时提示引擎加载，已就绪时直接进入解析阶段
  if (!enginePromise) {
    await onProgress?.('engine');
  }
  const lib = await loadEngine(wasmBase);

  // 等待回调完成绘制后再开始同步解析，避免遮罩来不及显示就阻塞主线程
  await onProgress?.('parsing');
  const dataPointer = lib.dwg_read_data(buffer, Dwg_File_Type.DWG);
  if (!dataPointer) {
    throw new Error('无法解析该 DWG 文件');
  }

  let db: DwgDatabase;
  let hasAssociativeDimensions = false;
  try {
    const classCount = lib.dwg_get_num_classes(dataPointer);
    for (let index = 0; index < classCount; index += 1) {
      const dwgClass = lib.dwg_get_class(dataPointer, index);
      if (dwgClass?.dxfname === 'DIMASSOC' && dwgClass.num_instances > 0) {
        hasAssociativeDimensions = true;
        break;
      }
    }
    db = lib.convert(dataPointer);
  } finally {
    try {
      lib.dwg_free(dataPointer);
    } catch {
      // 释放失败不影响解析结果
    }
  }

  const drawing = normalizeDwgDatabase(db, fileName, { measureText, hasAssociativeDimensions });
  drawing.version ||= new TextDecoder().decode(new Uint8Array(buffer, 0, 6));
  if (drawing.layers.length === 0) {
    throw new Error('无法解析该 DWG 图纸（文件已损坏或格式不受支持）');
  }
  return drawing;
}
