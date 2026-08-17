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

function resolveHeatShrinkMaterial(draft: DrawingWizardDraft) {
  if (draft.heatShrinkResource) {
    return {
      key: `protective_sleeve:${draft.heatShrinkResource.resourceItemId}`,
      name: draft.heatShrinkResource.name,
      code: draft.heatShrinkResource.model,
      unit: draft.heatShrinkResource.unit ?? 'PCS',
    };
  }
  const legacyName = draft.heatShrink?.trim();
  if (!legacyName) return undefined;
  return { key: `legacy-heat-shrink:${legacyName}`, name: legacyName, code: '', unit: 'PCS' };
}

export function countDrawingMaterialKinds(draft: DrawingWizardDraft): number {
  const ids = new Set<string>();
  for (const connector of [draft.singleConnector, draft.leftConnector, draft.rightConnector]) {
    if (connector) ids.add(`connector:${connector.id}`);
  }
  if (draft.wireResource) ids.add(`wire:${draft.wireResource.resourceItemId}`);
  if (draft.hasMold) ids.add(`mold:${draft.modelResource?.resourceItemId ?? 'configured'}`);
  const heatShrink = resolveHeatShrinkMaterial(draft);
  if (heatShrink) ids.add(heatShrink.key);
  return ids.size;
}

function style(patch: Partial<DrawingObjectStyle> = {}): DrawingObjectStyle {
  return { ...defaultDrawingObjectStyle, ...patch };
}

export function validateStandaloneDrawingWizard(draft: DrawingWizardDraft): DrawingWizardValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isSingle = draft.topology.topology === 'single-end';

  if (isSingle && !draft.singleConnector) errors.push('请选择连接器/模型。');
  if (!isSingle && (!draft.leftConnector || !draft.rightConnector)) errors.push('请选择左、右连接器/模型。');
  if (!draft.wireResource) errors.push('请选择线材规格。');
  if (!draft.totalLengthMm || draft.totalLengthMm <= 0) errors.push('总长度必须大于 0mm。');
  if (draft.wires.length === 0) errors.push('至少需要一条线材配置。');
  if (draft.wires.some((wire) => !wire.wireNo.trim())) warnings.push('存在未填写线号的线材。');
  if (draft.wires.some((wire) => !wire.lengthMm || wire.lengthMm <= 0)) errors.push('芯线长度必须大于 0mm。');
  if (!isSingle && draft.rightConnector && draft.wires.some((wire) => !wire.targetPin || wire.targetPin < 1 || wire.targetPin > draft.rightConnector!.pinCount)) {
    errors.push('目标 PIN 必须在右连接器 PIN 范围内。');
  }
  return { errors, warnings };
}

function relativeBase(id: string, kind: DrawingObject['kind'], x: number, y: number, width: number, height: number, zIndex: number) {
  return { id, kind, x, y, width, height, rotation: 0, zIndex, locked: false, visible: true, style: style() };
}

function wireBundleObject(draft: DrawingWizardDraft, width: number): DrawingGroupObject {
  const coreHeight = 18;
  const children = draft.wires.map((wire, index): DrawingGroupObject => {
    const coreId = createDrawingId(`wire-core-${wire.pin}`);
    return {
      ...relativeBase(coreId, 'group', 0, index * coreHeight, width, coreHeight, index + 1),
      kind: 'group', groupKind: 'wire-core',
      children: [
        {
          ...relativeBase(createDrawingId('line'), 'line', 0, 0, width, coreHeight, 1), kind: 'line',
          style: style({ stroke: wire.color, color: wire.color, strokeWidth: 2 }),
          points: [{ x: 0, y: coreHeight / 2 }, { x: width, y: coreHeight / 2 }], orthogonal: false,
        },
        {
          ...relativeBase(createDrawingId('text'), 'text', Math.max(0, width / 2 - 45), 0, 90, coreHeight, 2),
          kind: 'text', text: wire.wireNo,
        },
        {
          ...relativeBase(createDrawingId('label'), 'label', width - 28, 0, 28, coreHeight, 3),
          kind: 'label', text: String(wire.targetPin ?? ''),
        },
      ],
    };
  });
  return {
    ...relativeBase(createDrawingId('wire-bundle'), 'group', 245, 260, width, Math.max(36, children.length * coreHeight), 3),
    kind: 'group', groupKind: 'wire-bundle', children,
  };
}

function connectorObject(
  resource: NonNullable<DrawingWizardDraft['leftConnector']>,
  side: 'left' | 'right' | 'none',
): Extract<DrawingObject, { kind: 'connector' }> {
  return {
    id: createDrawingId('connector'),
    kind: 'connector',
    x: side === 'right' ? 940 : 90,
    y: 210,
    width: 150,
    height: 230,
    rotation: 0,
    zIndex: 10,
    locked: false,
    visible: true,
    style: style(),
    label: resource.name,
    pinCount: resource.pinCount,
    gender: resource.gender,
    side,
  };
}

function drawingBomRows(draft: DrawingWizardDraft, left?: DrawingConnectorResource, right?: DrawingConnectorResource) {
  const materials = new Map<string, { code: string; name: string; unit: string; quantity: number }>();
  const add = (key: string, name: string | undefined, unit: string, quantity: number, code = '') => {
    if (!name) return;
    const current = materials.get(key);
    materials.set(key, { code, name, unit, quantity: (current?.quantity ?? 0) + quantity });
  };
  add(`connector:${left?.id}`, left?.name, 'PCS', 1);
  add(`connector:${right?.id}`, right?.name, 'PCS', 1);
  const wireLengthM = draft.wires.reduce((total, wire) => total + wire.lengthMm, 0) / 1000;
  add(`wire:${draft.wireResource?.resourceItemId}`, draft.wireResource?.name, 'M', wireLengthM);
  if (draft.hasMold) add(`model:${draft.modelResource?.resourceItemId ?? 'generic'}`, draft.modelResource?.name ?? '外线模具', 'PCS', 1);
  const heatShrink = resolveHeatShrinkMaterial(draft);
  if (heatShrink) add(heatShrink.key, heatShrink.name, heatShrink.unit, 1, heatShrink.code);
  return [...materials.values()].map((material, index) => ({
    序号: String(index + 1), 物料编码: material.code, '物料名称/规格': material.name, 单位: material.unit,
    用量: String(Number(material.quantity.toFixed(3))), 备注: '',
  }));
}

export function createDrawingFromWizard(draft: DrawingWizardDraft): DrawingDocument {
  const validation = validateStandaloneDrawingWizard(draft);
  if (validation.errors.length > 0) throw new Error(validation.errors.join(' '));

  const name = draft.drawingNo.trim() || '未命名线束图';
  const base = createBlankDrawingDocument(name);
  const isSingle = draft.topology.topology === 'single-end';
  const left = isSingle ? draft.singleConnector : draft.leftConnector;
  const right = isSingle ? undefined : draft.rightConnector;
  const heatShrink = resolveHeatShrinkMaterial(draft);
  const frameObjects = [...base.objects, createWiringTable()].map((object) => {
    if (object.kind === 'wiring-table') {
      return {
        ...object,
        rows: draft.wires.map((wire) => ({ P1: String(wire.pin), 颜色: wire.color, P2: String(wire.targetPin ?? ''), 长度: String(wire.lengthMm), 线号: wire.wireNo })),
      };
    }
    if (object.kind === 'bom-table') {
      const rows = drawingBomRows(draft, left, right);
      const tableWithRows = {
        ...object,
        rows,
        rowHeights: rows.map(() => 18),
      };
      const layout = resolveDrawingTableLayout(tableWithRows);
      const height = (layout.showTitleRow ? layout.titleRowHeight : 0)
        + layout.headerRowHeight
        + layout.rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0);

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
      rows: object.rows.map((row) => row.C3 === '工程图号' ? { ...row, C4: draft.drawingNo || '' } : row),
    };
  });
  const objects: DrawingObject[] = [
    ...(left ? [connectorObject(left, isSingle ? 'none' : 'left')] : []),
    ...(right ? [connectorObject(right, 'right')] : []),
    wireBundleObject(draft, isSingle ? 620 : 690),
    {
      id: createDrawingId('dimension'),
      kind: 'dimension',
      x: 320,
      y: 170,
      width: 520,
      height: 45,
      rotation: 0,
      zIndex: 4,
      locked: false,
      visible: true,
      style: style(),
      label: `${draft.totalLengthMm}±${draft.toleranceMm}mm`,
      start: { x: 320, y: 188 },
      end: { x: 840, y: 188 },
    },
    {
      id: createDrawingId('tech-requirements'),
      kind: 'tech-requirements',
      x: 70,
      y: 520,
      width: 500,
      height: 150,
      rotation: 0,
      zIndex: 5,
      locked: false,
      visible: true,
      style: style({ fontSize: 11 }),
      requirements: [
        `总长 ${draft.totalLengthMm}±${draft.toleranceMm}mm。`,
        '连接器端子压接后不得有松脱、变形。',
        '成品须进行导通及短路测试。',
      ],
    },
    ...frameObjects,
  ];

  if (heatShrink) {
    objects.push({
      id: createDrawingId('accessory'),
      kind: 'accessory',
      x: 420,
      y: 238,
      width: 110,
      height: 45,
      rotation: 0,
      zIndex: 8,
      locked: false,
      visible: true,
      style: style({ fill: '#e2e8f0' }),
      label: heatShrink.name,
      accessoryType: 'sleeve',
    });
  }

  const titleBlock = frameObjects.find((object) => object.kind === 'title-block');

  return {
    ...base,
    name,
    objects,
    titleBlock: { title: titleBlock?.kind === 'title-block' ? name : base.titleBlock.title, drawingNo: draft.drawingNo || '', revision: 'A' },
    techRequirements: ['连接器端子压接后不得有松脱、变形。', '成品须进行导通及短路测试。'],
    wizardSource: draft,
  };
}
