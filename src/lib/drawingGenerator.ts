import { createBlankDrawingDocument, createDrawingId, defaultDrawingObjectStyle } from '@/lib/drawingDocument';
import type {
  DrawingDocument,
  DrawingObject,
  DrawingObjectStyle,
  DrawingWizardDraft,
} from '@/types/drawing';

export type DrawingWizardValidation = {
  errors: string[];
  warnings: string[];
};

function style(patch: Partial<DrawingObjectStyle> = {}): DrawingObjectStyle {
  return { ...defaultDrawingObjectStyle, ...patch };
}

export function validateStandaloneDrawingWizard(draft: DrawingWizardDraft): DrawingWizardValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isSingle = draft.topology.topology === 'single-end';

  if (isSingle && !draft.singleConnector) errors.push('请选择连接器/模型。');
  if (!isSingle && (!draft.leftConnector || !draft.rightConnector)) errors.push('请选择左、右连接器/模型。');
  if (!draft.totalLengthMm || draft.totalLengthMm <= 0) errors.push('总长度必须大于 0mm。');
  if (draft.wires.length === 0) errors.push('至少需要一条线材配置。');
  if (draft.wires.some((wire) => !wire.wireNo.trim())) warnings.push('存在未填写线号的线材。');
  if (draft.wires.some((wire) => !wire.lengthMm || wire.lengthMm <= 0)) warnings.push('存在未填写有效长度的线材。');
  return { errors, warnings };
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

export function createDrawingFromWizard(draft: DrawingWizardDraft): DrawingDocument {
  const validation = validateStandaloneDrawingWizard(draft);
  if (validation.errors.length > 0) throw new Error(validation.errors.join(' '));

  const name = draft.drawingNo.trim() || '未命名线束图';
  const base = createBlankDrawingDocument(name);
  const isSingle = draft.topology.topology === 'single-end';
  const left = isSingle ? draft.singleConnector : draft.leftConnector;
  const right = isSingle ? undefined : draft.rightConnector;
  const wireCount = draft.wires.length;
  const frameObjects = base.objects.map((object) => {
    if (object.kind !== 'table' || object.title !== 'XXx公司') return object;
    return {
      ...object,
      rows: object.rows.map((row) => row.字段 === '工程图号'
        ? { ...row, 内容: draft.drawingNo || 'WH-NEW' }
        : row),
    };
  });
  const objects: DrawingObject[] = [
    ...(left ? [connectorObject(left, isSingle ? 'none' : 'left')] : []),
    ...(right ? [connectorObject(right, 'right')] : []),
    {
      id: createDrawingId('wire-bundle'),
      kind: 'wire-bundle',
      x: 245,
      y: 260,
      width: isSingle ? 620 : 690,
      height: 125,
      rotation: 0,
      zIndex: 3,
      locked: false,
      visible: true,
      style: style({ fill: '#f1f5f9' }),
      label: draft.drawingNo || '线束',
      wireCount,
      wireKind: draft.topology.wireKind,
    },
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

  if (draft.heatShrink) {
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
      label: draft.heatShrink,
      accessoryType: 'sleeve',
    });
  }

  const titleBlock = frameObjects.find((object) => object.kind === 'title-block');

  return {
    ...base,
    name,
    objects,
    titleBlock: { title: titleBlock?.kind === 'title-block' ? name : base.titleBlock.title, drawingNo: draft.drawingNo || 'WH-NEW', revision: 'A' },
    techRequirements: ['连接器端子压接后不得有松脱、变形。', '成品须进行导通及短路测试。'],
    wizardSource: draft,
  };
}
