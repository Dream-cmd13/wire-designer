import { WIRE_COLORS } from '@/data/catalogOptions';
import { createBlankDrawingDocument, createDrawingId, createWiringTable, defaultDrawingObjectStyle, DRAWING_PAGE_INSET } from '@/lib/drawingDocument';
import { resolveDrawingTableLayout } from '@/lib/drawingTableLayout';
import type {
  DrawingDocument,
  DrawingConnectorResource,
  DrawingGroupObject,
  DrawingObject,
  DrawingObjectStyle,
  DrawingWireDraft,
  DrawingWizardDraft,
} from '@/types/drawing';

export type DrawingWizardValidation = {
  errors: string[];
  warnings: string[];
};

export type DrawingWireBatch = {
  color?: string;
  lengthMm?: number;
  wireNoPrefix?: string;
  startNumber?: number;
  connection?: 'straight' | 'reverse';
};

export function applyDrawingWireBatch(wires: DrawingWireDraft[], batch: DrawingWireBatch): DrawingWireDraft[] {
  const start = batch.startNumber ?? 1;
  return wires.map((wire, index) => ({
    ...wire,
    color: batch.color ?? wire.color,
    lengthMm: batch.lengthMm ?? wire.lengthMm,
    wireNo: batch.wireNoPrefix === undefined ? wire.wireNo : `${batch.wireNoPrefix}${String(start + index).padStart(2, '0')}`,
    targetPin: batch.connection === 'reverse' ? wires.length - index : batch.connection === 'straight' ? index + 1 : wire.targetPin,
  }));
}

function resolveProtectiveSleeveMaterial(draft: DrawingWizardDraft) {
  const resource = draft.protectiveSleeveResource;
  if (!resource) return undefined;
  return {
    key: `protective_sleeve:${resource.resourceItemId}`,
    name: resource.name,
    code: resource.model,
    unit: resource.unit ?? 'PCS',
  };
}

export function countDrawingMaterialKinds(draft: DrawingWizardDraft): number {
  const ids = new Set<string>();
  for (const connector of [draft.singleConnector, draft.leftConnector, draft.rightConnector]) {
    if (connector) ids.add(`connector:${connector.id}`);
  }
  if (draft.wireResource) ids.add(`wire:${draft.wireResource.resourceItemId}`);
  if (draft.hasMold) ids.add(`mold:${draft.modelResource?.resourceItemId ?? 'configured'}`);
  const protectiveSleeve = resolveProtectiveSleeveMaterial(draft);
  if (protectiveSleeve) ids.add(protectiveSleeve.key);
  else if (draft.hasProtectiveSleeve) ids.add('protective_sleeve:default');
  if (draft.hasTailClamp) ids.add(`tail_clamp:${draft.tailClampResource?.resourceItemId ?? 'default'}`);
  const ferriteCount = draft.ferriteCount ?? 0;
  for (let i = 0; i < ferriteCount; i += 1) {
    const resource = draft.ferriteResources?.[i];
    ids.add(`ferrite:${resource?.resourceItemId ?? `default-${i + 1}`}`);
  }
  return ids.size;
}

function style(patch: Partial<DrawingObjectStyle> = {}): DrawingObjectStyle {
  return { ...defaultDrawingObjectStyle, ...patch };
}

function findDrawingWireColor(value: string) {
  const normalized = value.trim().toLowerCase();
  return WIRE_COLORS.find((color) => [color.id, color.name, color.name.replace(/色$/, ''), color.hex.toLowerCase()].includes(normalized));
}

export function getDrawingWireColorName(value: string): string {
  return findDrawingWireColor(value)?.name ?? value;
}

export function getDrawingWireColorHex(value: string): string | undefined {
  return findDrawingWireColor(value)?.hex.toLowerCase() ?? (/^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : undefined);
}

export function getDrawingWireMaterialLengthMm(draft: DrawingWizardDraft): number {
  return draft.wireResource?.wireKind === 'jacketed'
    ? draft.cableCutLengthMm ?? 0
    : draft.wires.reduce((total, wire) => total + wire.lengthMm, 0);
}

export function validateStandaloneDrawingWizard(draft: DrawingWizardDraft): DrawingWizardValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isSingle = draft.endpointForm === 'single-end';

  if (isSingle && !draft.singleConnector) errors.push('请选择连接器/模型。');
  if (!isSingle && (!draft.leftConnector || !draft.rightConnector)) errors.push('请选择左、右连接器/模型。');
  if (!draft.wireResource) errors.push('请选择线材规格。');
  if (!Number.isFinite(draft.totalLengthMm) || draft.totalLengthMm <= 0) errors.push('总长度必须大于 0mm。');
  if (!Number.isFinite(draft.toleranceMm) || draft.toleranceMm < 0) errors.push('公差必须为非负数。');
  if (draft.wires.length === 0) errors.push('至少需要一条线材配置。');
  if (draft.wires.some((wire) => !wire.wireNo.trim())) warnings.push('存在未填写线号的线材。');
  if (draft.wires.some((wire) => !Number.isFinite(wire.lengthMm) || wire.lengthMm <= 0)) errors.push('芯线长度必须大于 0mm。');
  const rightPinCount = draft.rightConnector?.pinCount;
  if (!isSingle && rightPinCount !== undefined && draft.wires.some((wire) => wire.targetPin === undefined || !Number.isInteger(wire.targetPin) || wire.targetPin < 1 || wire.targetPin > rightPinCount)) {
    errors.push('目标 PIN 必须在右连接器 PIN 范围内。');
  }
  if (draft.wireResource?.wireKind === 'jacketed') {
    const cutLength = draft.cableCutLengthMm ?? 0;
    if (!Number.isFinite(cutLength) || cutLength <= 0) errors.push('护套线下料长度必须大于 0 mm。');
    const remainingColors = (draft.wireResource.coreColors ?? []).map((color) => getDrawingWireColorName(color).toLowerCase());
    if (remainingColors.length > 0 && draft.wires.some((wire) => {
      const index = remainingColors.indexOf(getDrawingWireColorName(wire.color).toLowerCase());
      if (index < 0) return true;
      remainingColors.splice(index, 1);
      return false;
    })) errors.push('芯线颜色必须与所选护套线的规格一致。');
  }
  if (!draft.drawingNo.trim()) warnings.push('图号未填写。');
  if (draft.wireResource?.shielded && !draft.shieldTermination?.trim()) warnings.push('请在出图前确认屏蔽层两端的接壳或绝缘工艺。');
  return { errors, warnings };
}

function relativeBase(id: string, kind: DrawingObject['kind'], x: number, y: number, width: number, height: number, zIndex: number) {
  return { id, kind, x, y, width, height, rotation: 0, zIndex, locked: false, visible: true, style: style() };
}

function lineObject(x: number, y: number, endX: number, endY: number, zIndex: number, lineStyle = style()): Extract<DrawingObject, { kind: 'line' | 'polyline' | 'curve' | 'freehand' }> {
  return {
    ...relativeBase(createDrawingId('line'), 'line', x, y, endX - x, endY - y, zIndex),
    kind: 'line', style: lineStyle, points: [{ x, y }, { x: endX, y: endY }], orthogonal: false,
  };
}

function wireBundleObject(draft: DrawingWizardDraft, x: number, y: number, width: number, coreHeight: number): DrawingGroupObject {
  const children = draft.wires.map((wire, index): DrawingGroupObject => {
    const coreId = createDrawingId(`wire-core-${wire.pin}`);
    const stroke = getDrawingWireColorHex(wire.color) ?? '#374151';
    const isLight = Number.parseInt(stroke.slice(1, 3), 16) >= 195
      && Number.parseInt(stroke.slice(3, 5), 16) >= 195
      && Number.parseInt(stroke.slice(5, 7), 16) >= 195;
    const lineY = coreHeight - 3;
    const label = (text: string, offset: number, zIndex: number): DrawingObject => ({
      ...relativeBase(createDrawingId('label'), 'label', offset, 0, 82, 12, zIndex),
      kind: 'label', text, style: style({ fontSize: 10 }),
    });
    return {
      ...relativeBase(coreId, 'group', 0, index * coreHeight, width, coreHeight, index + 1),
      kind: 'group', groupKind: 'wire-core',
      children: [
        ...(isLight ? [lineObject(0, lineY, width, lineY, 0, style({ stroke: '#64748b', strokeWidth: 4 }))] : []),
        lineObject(0, lineY, width, lineY, 1, style({ stroke, strokeWidth: 2 })),
        ...(coreHeight >= 16 ? [
          label(`P1-${wire.pin}`, 8, 2),
          label(wire.wireNo, width / 2 - 24, 3),
          ...(draft.endpointForm === 'double-end' ? [label(`P2-${wire.targetPin}`, width - 49, 4)] : []),
        ] : []),
      ],
    };
  });
  return {
    ...relativeBase(createDrawingId('wire-bundle'), 'group', x, y, width, children.length * coreHeight, 3),
    kind: 'group', groupKind: 'wire-bundle', children,
  };
}

function connectorObject(
  resource: NonNullable<DrawingWizardDraft['leftConnector']>,
  side: 'left' | 'right' | 'none',
  height: number,
): Extract<DrawingObject, { kind: 'connector' }> {
  return {
    id: createDrawingId('connector'),
    kind: 'connector',
    x: side === 'right' ? 910 : 90,
    y: 150,
    width: 200,
    height,
    rotation: 0,
    zIndex: 10,
    locked: false,
    visible: true,
    style: style(),
    label: `${side === 'right' ? 'P2' : 'P1'} ${resource.name}`,
    pinCount: resource.pinCount,
    gender: resource.gender,
    side,
    showPinGrid: false,
  };
}

function drawingBomRows(draft: DrawingWizardDraft, left?: DrawingConnectorResource, right?: DrawingConnectorResource) {
  const materials = new Map<string, { code: string; name: string; unit: string; quantity: number }>();
  const add = (key: string, name: string | undefined, unit: string, quantity: number, code = '') => {
    if (!name) return;
    const current = materials.get(key);
    materials.set(key, { code, name, unit, quantity: (current?.quantity ?? 0) + quantity });
  };
  const leftCount = Math.max(1, draft.leftConnectorCount ?? 1);
  const rightCount = Math.max(1, draft.rightConnectorCount ?? 1);
  add(`connector:${left?.id}`, left?.name, 'PCS', leftCount, left?.model);
  add(`connector:${right?.id}`, right?.name, 'PCS', rightCount, right?.model);
  const wireLengthM = getDrawingWireMaterialLengthMm(draft) / 1000;
  add(`wire:${draft.wireResource?.resourceItemId}`, draft.wireResource?.name, 'M', wireLengthM, draft.wireResource?.model);
  if (draft.hasMold) add(`model:${draft.modelResource?.resourceItemId ?? 'generic'}`, draft.modelResource?.name ?? '外线模具', 'PCS', 1, draft.modelResource?.model);
  const protectiveSleeve = resolveProtectiveSleeveMaterial(draft);
  if (protectiveSleeve) add(protectiveSleeve.key, protectiveSleeve.name, protectiveSleeve.unit, 1, protectiveSleeve.code);
  else if (draft.hasProtectiveSleeve) add('protective_sleeve:default', '热缩套管', 'PCS', 1);
  if (draft.hasTailClamp) {
    add(`tail_clamp:${draft.tailClampResource?.resourceItemId ?? 'default'}`, draft.tailClampResource?.name ?? '线尾卡位', 'PCS', 1, draft.tailClampResource?.model);
  }
  const ferriteCount = draft.ferriteCount ?? 0;
  for (let i = 0; i < ferriteCount; i += 1) {
    const resource = draft.ferriteResources?.[i];
    add(`ferrite:${resource?.resourceItemId ?? 'default'}`, resource?.name ?? '抗干扰磁环', 'PCS', 1, resource?.model);
  }
  return [...materials.values()].map((material, index) => ({
    序号: String(index + 1), 物料编码: material.code, '物料名称/规格': material.name, 单位: material.unit,
    用量: String(Number(material.quantity.toFixed(3))), 备注: '',
  }));
}

export function createDrawingFromWizard(draft: DrawingWizardDraft): DrawingDocument {
  const validation = validateStandaloneDrawingWizard(draft);
  if (validation.errors.length > 0) throw new Error(validation.errors.join(' '));

  const drawingNo = draft.drawingNo.trim();
  const productName = draft.productName?.trim() || '线束组件';
  const name = drawingNo || draft.productName?.trim() || '未命名线束图';
  const base = createBlankDrawingDocument(name);
  const isSingle = draft.endpointForm === 'single-end';
  const left = isSingle ? draft.singleConnector : draft.leftConnector;
  const right = isSingle ? undefined : draft.rightConnector;
  const protectiveSleeve = resolveProtectiveSleeveMaterial(draft);
  const coreHeight = Math.min(25, Math.max(3, Math.floor(128 / draft.wires.length)));
  const connectorHeight = Math.max(94, 43 + draft.wires.length * coreHeight);
  const leftObject = left ? connectorObject(left, isSingle ? 'none' : 'left', connectorHeight) : undefined;
  const rightObject = right ? connectorObject(right, 'right', connectorHeight) : undefined;
  const wireStartX = 290;
  const wireEndX = rightObject?.x ?? 910;
  const wireStartY = 185;
  const dimensionStartX = leftObject?.x ?? 90;
  const dimensionEndX = rightObject ? rightObject.x + rightObject.width : wireEndX;
  const dimensionEndY = rightObject?.y ?? wireStartY;
  const includeWiringTable = draft.includeWiringTable !== false;
  const tableCount = includeWiringTable ? Math.ceil(draft.wires.length / 10) : 0;
  const rowsPerTable = tableCount > 0 ? Math.ceil(draft.wires.length / tableCount) : 0;
  const tableWidth = tableCount <= 1 ? 520 : Math.floor((1090 - (tableCount - 1) * 12) / tableCount);
  const wiringTables = Array.from({ length: tableCount }, (_, index) => {
    const table = createWiringTable();
    const rowStart = index * rowsPerTable;
    const withRows = {
      ...table,
      x: tableCount === 1 ? 600 : 55 + index * (tableWidth + 12),
      y: 340,
      width: tableWidth,
      title: tableCount === 1 ? table.title : `${table.title} ${index + 1}/${tableCount}`,
      columns: ['P1', '颜色', isSingle ? '线尾' : 'P2', '芯长(mm)', '线号'],
      columnKeys: ['P1', '颜色', 'P2', '长度', '线号'],
      columnWidths: [65, 115, 65, 105, 170],
      rows: draft.wires.slice(rowStart, rowStart + rowsPerTable).map((wire) => ({
        P1: String(wire.pin), 颜色: getDrawingWireColorName(wire.color),
        P2: isSingle ? '自由端' : String(wire.targetPin ?? ''), 长度: String(wire.lengthMm), 线号: wire.wireNo,
      })),
    };
    return { ...withRows, height: resolveDrawingTableLayout(withRows).contentHeight };
  });
  const frameObjects = base.objects.map((object) => {
    if (object.kind === 'bom-table') {
      const rows = drawingBomRows(draft, left, right);
      const tableWithRows = {
        ...object,
        rows,
        rowHeights: rows.map(() => 18),
      };
      const layout = resolveDrawingTableLayout(tableWithRows);
      const height = layout.contentHeight;

      return {
        ...tableWithRows,
        rowHeights: layout.rowHeights,
        height,
        y: base.page.height - DRAWING_PAGE_INSET - height,
      };
    }
    if (object.kind !== 'table' || object.tableRole !== 'title-block') return object;
    return {
      ...object,
      columns: object.columns.map((column, index) => index === 0 ? draft.companyName?.trim() || '' : index === 5 ? productName : column),
      rows: object.rows.map((row) => row.C3 === '工程图号' ? { ...row, C4: drawingNo } : row.C8 === '比例' ? { ...row, C9: '不按比例' } : row),
    };
  });
  const customNoteLines = (draft.processNotes ?? [])
    .flatMap((note) => note.split('\n'))
    .map((line) => line.trim())
    .filter(Boolean);
  const requirements = customNoteLines.length > 0
    ? customNoteLines
    : [
        '接线为逻辑示意。实物针位和端接方式按所选连接器规格执行。',
        ...(draft.wireResource?.shielded ? [`屏蔽层端接：${draft.shieldTermination?.trim() || '待确认'}`] : []),
        ...(draft.tinningLengthMm && draft.tinningLengthMm > 0
          ? [`尾部上锡：${draft.tinningLengthMm}±${draft.tinningToleranceMm ?? 0} mm${draft.halfStrip ? '（半剥）' : ''}`]
          : []),
        '成品须进行导通及短路测试。',
      ];
  const requirementsHeight = Math.max(86, 34 + requirements.length * 16);
  const objects: DrawingObject[] = [
    ...(leftObject ? [leftObject] : []),
    ...(rightObject ? [rightObject] : []),
    wireBundleObject(draft, wireStartX, wireStartY, wireEndX - wireStartX, coreHeight),
    lineObject(dimensionStartX, 117, dimensionStartX, 146, 4),
    lineObject(dimensionEndX, 117, dimensionEndX, dimensionEndY - 4, 4),
    {
      id: createDrawingId('dimension'),
      kind: 'dimension',
      x: dimensionStartX,
      y: 87.5,
      width: dimensionEndX - dimensionStartX,
      height: 45,
      rotation: 0,
      zIndex: 4,
      locked: false,
      visible: true,
      style: style(),
      label: `成品总长 ${draft.totalLengthMm}±${draft.toleranceMm} mm`,
      start: { x: dimensionStartX, y: 110 },
      end: { x: dimensionEndX, y: 110 },
    },
    {
      id: createDrawingId('tech-requirements'),
      kind: 'tech-requirements',
      x: 70,
      y: tableCount <= 1 ? 370 : 570,
      width: 500,
      height: requirementsHeight,
      rotation: 0,
      zIndex: 5,
      locked: false,
      visible: true,
      style: style({ fontSize: 11 }),
      requirements,
    },
    ...wiringTables,
    ...frameObjects,
  ];

  if (draft.hasTopView && leftObject) {
    objects.push({
      id: createDrawingId('accessory'),
      kind: 'accessory',
      x: leftObject.x,
      y: leftObject.y + leftObject.height + 16,
      width: 140,
      height: 42,
      rotation: 0,
      zIndex: 7,
      locked: false,
      visible: true,
      style: style({ fill: '#f8fafc' }),
      label: '连接器俯视图',
      accessoryType: 'model',
    });
  }

  const ferriteCount = draft.ferriteCount ?? 0;
  for (let i = 0; i < ferriteCount; i += 1) {
    const resource = draft.ferriteResources?.[i];
    objects.push({
      id: createDrawingId('accessory'),
      kind: 'accessory',
      x: 420 + i * 130,
      y: 168,
      width: 100,
      height: 36,
      rotation: 0,
      zIndex: 8,
      locked: false,
      visible: true,
      style: style({ fill: '#eef2ff' }),
      label: resource?.name ?? `磁环 ${i + 1}`,
      accessoryType: 'model',
    });
  }

  if (draft.hasTailClamp) {
    objects.push({
      id: createDrawingId('accessory'),
      kind: 'accessory',
      x: 770,
      y: 168,
      width: 96,
      height: 36,
      rotation: 0,
      zIndex: 8,
      locked: false,
      visible: true,
      style: style({ fill: '#f1f5f9' }),
      label: draft.tailClampResource?.name ?? '线尾卡位',
      accessoryType: 'model',
    });
  }

  if (protectiveSleeve || draft.hasProtectiveSleeve) {
    objects.push({
      id: createDrawingId('accessory'),
      kind: 'accessory',
      x: 420,
      y: 140,
      width: 110,
      height: 30,
      rotation: 0,
      zIndex: 8,
      locked: false,
      visible: true,
      style: style({ fill: '#e2e8f0' }),
      label: protectiveSleeve?.name ?? '热缩套管',
      accessoryType: 'sleeve',
    });
  }

  if (draft.packagingGraphic) {
    objects.push({
      id: createDrawingId('accessory'),
      kind: 'accessory',
      x: 820,
      y: 440,
      width: 240,
      height: 110,
      rotation: 0,
      zIndex: 8,
      locked: false,
      visible: true,
      style: style({ fill: '#ffffff' }),
      label: `扎线示意图 · ${draft.packagingGraphic.name}`,
      accessoryType: 'packaging',
      svgGraphic: draft.packagingGraphic.svgPreview,
    });
  }

  return {
    ...base,
    name,
    objects,
    titleBlock: { title: productName, drawingNo, revision: 'A' },
    techRequirements: requirements,
    wizardSource: draft,
  };
}
