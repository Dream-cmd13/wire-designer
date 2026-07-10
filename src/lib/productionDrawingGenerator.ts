import { generateBOM } from '@/lib/bom';
import { generateId } from '@/lib/commands';
import type {
  HarnessConfig,
  ProductionDrawing,
  ProductionDrawingObject,
} from '@/types/harness';

export interface ProductionDrawingGenerateOptions {
  drawingNo?: string;
  revision?: string;
  lengthToleranceMm?: number;
  techRequirements?: string[];
}

function generateWiringTableRows(config: HarnessConfig) {
  let item = 1;
  return config.materials.flatMap((material) =>
    material.circuits.map((circuit) => ({
      item: item++,
      color: circuit.color,
      signalName: circuit.signalName,
      connectionNo: circuit.connectionNo ?? String(item - 1),
      ...(circuit.start?.pin === undefined ? {} : { startPin: circuit.start.pin }),
      ...(circuit.end?.pin === undefined ? {} : { endPin: circuit.end.pin }),
      lengthMm: circuit.lengthMm ?? material.spec.lengthMm,
    })));
}

function getTailTreatmentLabel(config: HarnessConfig): string | null {
  if (config.connectors.length !== 1) return null;
  const material = config.materials.find((item) => item.spec.kind === 'electronic');
  if (!material || material.spec.kind !== 'electronic') return null;

  const end = material.spec.endTreatment.end;
  if (end.stripped && end.termination === 'tinned') {
    return `尾端处理：剥皮 ${end.stripLengthMm}mm 上锡`;
  }
  if (end.stripped) {
    return `尾端处理：剥皮 ${end.stripLengthMm}mm`;
  }
  return '尾端处理：按工艺要求';
}

export function generateProductionDrawingObjects(
  config: HarnessConfig,
  options: ProductionDrawingGenerateOptions = {},
): ProductionDrawingObject[] {
  const connectorObjects: ProductionDrawingObject[] = config.connectors.map((connector, index) => ({
    id: generateId(),
    kind: 'connector',
    connectorId: connector.id,
    label: connector.label || connector.connector.name,
    pinCount: connector.connector.pinCount,
    side: config.connectors.length === 1 ? 'none' : index === 0 ? 'left' : 'right',
    x: index === 0 ? 90 : 940,
    y: 210,
    width: 150,
    height: 230,
  }));

  const materialIds = config.materials.map((material) => material.id);
  const wireCount = config.materials.reduce(
    (count, material) => count + Math.max(1, material.circuits.length),
    0,
  );
  const longestLength = Math.max(0, ...config.materials.map((material) => material.spec.lengthMm));
  const tolerance = options.lengthToleranceMm ?? 10;
  const tailTreatmentLabel = getTailTreatmentLabel(config);

  return [
    ...connectorObjects,
    {
      id: generateId(),
      kind: 'wire-bundle',
      materialIds,
      wireCount,
      jacketed: config.materials.some((material) => material.spec.kind === 'jacketed'),
      x: 245,
      y: 260,
      width: config.connectors.length > 1 ? 690 : 620,
      height: 125,
    },
    {
      id: generateId(),
      kind: 'dimension',
      label: longestLength > 0 ? `${longestLength}±${tolerance}mm` : '长度待确认',
      x: 320,
      y: 170,
      width: 520,
      height: 45,
    },
    ...(tailTreatmentLabel
      ? [{
          id: generateId(),
          kind: 'text' as const,
          text: tailTreatmentLabel,
          fontSize: 12,
          x: config.connectors.length === 1 ? 800 : 500,
          y: 430,
          width: 220,
          height: 28,
        }]
      : []),
    {
      id: generateId(),
      kind: 'tech-requirements',
      requirements: options.techRequirements ?? [
        '线束尺寸及接线关系应与本图一致。',
        '连接器端子压接后不得有松脱、变形。',
        '成品须进行导通及短路测试。',
      ],
      x: 70,
      y: 520,
      width: 500,
      height: 150,
    },
    {
      id: generateId(),
      kind: 'wiring-table',
      rows: generateWiringTableRows(config),
      x: 600,
      y: 400,
      width: 520,
      height: 95,
    },
    {
      id: generateId(),
      kind: 'bom-table',
      rows: generateBOM(config).map((item, index) => ({
        item: index + 1,
        description: item.description,
        quantity: item.quantity,
      })),
      x: 600,
      y: 505,
      width: 520,
      height: 185,
    },
    {
      id: generateId(),
      kind: 'title-block',
      title: config.name || '线束制造图',
      drawingNo: options.drawingNo ?? 'WH-NEW',
      revision: options.revision ?? 'A',
      x: 800,
      y: 705,
      width: 320,
      height: 60,
    },
  ];
}

export function generateProductionDrawing(
  config: HarnessConfig,
  options: ProductionDrawingGenerateOptions = {},
): ProductionDrawing {
  const techRequirements = options.techRequirements ?? [
    '线束尺寸及接线关系应与本图一致。',
    '连接器端子压接后不得有松脱、变形。',
    '成品须进行导通及短路测试。',
  ];
  const titleBlock = {
    title: config.name || '线束制造图',
    drawingNo: options.drawingNo ?? 'WH-NEW',
    revision: options.revision ?? 'A',
  };

  return {
    schemaVersion: 1,
    page: {
      size: 'A4',
      orientation: 'landscape',
      width: 1200,
      height: 800,
    },
    objects: generateProductionDrawingObjects(config, { ...options, techRequirements }),
    revisionTable: [],
    titleBlock,
    techRequirements,
  };
}

export function updateProductionDrawingObject(
  config: HarnessConfig,
  objectId: string,
  patch: Partial<ProductionDrawingObject>,
): HarnessConfig {
  if (!config.productionDrawing) return config;

  let patchedObject: ProductionDrawingObject | undefined;
  const objects = config.productionDrawing.objects.map((object) => {
    if (object.id !== objectId) return object;
    patchedObject = { ...object, ...patch } as ProductionDrawingObject;
    return patchedObject;
  });

  if (!patchedObject) return config;

  const titleBlock = patchedObject.kind === 'title-block'
    ? {
        title: patchedObject.title,
        drawingNo: patchedObject.drawingNo,
        revision: patchedObject.revision,
      }
    : config.productionDrawing.titleBlock;
  const techRequirements = patchedObject.kind === 'tech-requirements'
    ? patchedObject.requirements
    : config.productionDrawing.techRequirements;

  return {
    ...config,
    updatedAt: Date.now(),
    productionDrawing: {
      ...config.productionDrawing,
      objects,
      titleBlock,
      techRequirements,
    },
  };
}
