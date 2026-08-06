import { calculateCableOd, getCoreColors, lengthMmToCanvasWidth } from '@/lib/canvasMaterials';
import { generateId } from '@/lib/commands';
import { requireCatalogSnapshot } from '@/lib/catalogRuntime';
import { generateProductionDrawing } from '@/lib/productionDrawingGenerator';
import type {
  CanvasWireMaterial,
  Connector,
  ConnectorInstance,
  DrawingConnectorResource,
  DrawingWireRowDraft,
  DrawingWizardDraft,
  HarnessConfig,
  MaterialCircuit,
} from '@/types/harness';

export interface DrawingWizardValidation {
  errors: string[];
  warnings: string[];
}

export function createDrawingConnectorResources(
  side: DrawingConnectorResource['side'],
  connectors: Connector[] = requireCatalogSnapshot().connectors,
): DrawingConnectorResource[] {
  return connectors.map((connector) => ({
    id: connector.id,
    name: connector.name,
    view: 'front',
    gender: connector.type === 'male' ? 'male' : 'female',
    side,
    category: connector.manufacturer || '通用连接器',
    series: connector.name.split(' ')[0] || connector.name,
    pinCount: connector.pinCount,
    rowCount: connector.pinCount >= 20 ? 2 : 1,
    pitchMm: connector.pitch,
  }));
}

export function createDefaultDrawingWireRows(
  count: number,
  lengthMm = 300,
): DrawingWireRowDraft[] {
  const colors = getCoreColors(count);
  return Array.from({ length: count }, (_, index) => ({
    index: index + 1,
    color: colors[index],
    lengthMm,
    signalName: `WIRE-${String(index + 1).padStart(2, '0')}`,
    connectionNo: String(index + 1),
  }));
}

export function validateDrawingWizardDraft(
  draft: DrawingWizardDraft,
): DrawingWizardValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isSingle = draft.topology.topology === 'single-end';

  if (isSingle && !draft.singleResource) {
    errors.push('请选择连接器/模型。');
  }
  if (!isSingle && (!draft.leftResource || !draft.rightResource)) {
    errors.push('请选择左、右连接器/模型。');
  }
  if (!draft.attributes.totalLengthMm || draft.attributes.totalLengthMm <= 0) {
    errors.push('总长度必须大于 0mm。');
  }
  if (draft.wires.length === 0) {
    errors.push('至少需要一条线材配置。');
  }

  const missingLength = draft.wires.filter((wire) => !wire.lengthMm || wire.lengthMm <= 0).length;
  const missingSignal = draft.wires.filter((wire) => !wire.signalName?.trim()).length;
  if (missingLength > 0) warnings.push(`${missingLength} 条线材未填写有效长度。`);
  if (missingSignal > 0) warnings.push(`${missingSignal} 条线材未填写线号。`);

  const maxPins = isSingle
    ? draft.singleResource?.pinCount
    : Math.min(draft.leftResource?.pinCount ?? 0, draft.rightResource?.pinCount ?? 0);
  if (maxPins && draft.wires.length > maxPins) {
    errors.push(`线材数量不能超过可用 PIN 数 ${maxPins}。`);
  }

  return { errors, warnings };
}

function resourceToConnector(
  resource: DrawingConnectorResource,
  fallback: Connector,
): Connector {
  return {
    ...fallback,
    id: resource.id,
    name: resource.name,
    pinCount: resource.pinCount,
    pitch: resource.pitchMm,
    type: resource.gender,
    pinLabels: Array.from({ length: resource.pinCount }, (_, index) => String(index + 1)),
  };
}

function createConnectorInstance(
  resource: DrawingConnectorResource,
  x: number,
  label: string,
  connectors: Connector[] = requireCatalogSnapshot().connectors,
): ConnectorInstance {
  const fallback = connectors.find((connector) => connector.id === resource.id);
  if (!fallback) throw new Error(`Connector part not found: ${resource.id}`);
  return {
    id: generateId(),
    position: { x, y: 220 },
    connector: resourceToConnector(resource, fallback),
    label,
    jumpers: [],
  };
}

function createCircuit(
  row: DrawingWireRowDraft,
  leftConnector: ConnectorInstance | undefined,
  rightConnector: ConnectorInstance | undefined,
): MaterialCircuit {
  return {
    id: generateId(),
    ...(leftConnector
      ? {
          start: {
            connectorId: leftConnector.id,
            connectorSide: 'right' as const,
            pin: row.index,
          },
        }
      : {}),
    ...(rightConnector
      ? {
          end: {
            connectorId: rightConnector.id,
            connectorSide: 'left' as const,
            pin: row.index,
          },
        }
      : {}),
    color: row.color,
    signalName: row.signalName?.trim() || `WIRE-${row.index}`,
    connectionNo: row.connectionNo,
    lengthMm: row.lengthMm,
    coreIndex: row.index - 1,
  };
}

export function createHarnessConfigFromDrawingWizard(
  baseConfig: HarnessConfig,
  draft: DrawingWizardDraft,
): HarnessConfig {
  const validation = validateDrawingWizardDraft(draft);
  if (validation.errors.length > 0) {
    throw new Error(validation.errors.join(' '));
  }

  const isSingle = draft.topology.topology === 'single-end';
  const leftResource = isSingle ? draft.singleResource : draft.leftResource;
  const rightResource = isSingle ? undefined : draft.rightResource;
  const leftConnector = leftResource
    ? createConnectorInstance(leftResource, 90, isSingle ? '连接器' : '左连接器')
    : undefined;
  const rightConnector = rightResource
    ? createConnectorInstance(rightResource, 900, '右连接器')
    : undefined;
  const totalLengthMm = draft.attributes.totalLengthMm ?? 300;
  const rows = draft.wires.map((row) => ({
    ...row,
    lengthMm: row.lengthMm && row.lengthMm > 0 ? row.lengthMm : totalLengthMm,
  }));

  let materials: CanvasWireMaterial[];
  if (draft.topology.wireKind === 'jacketed') {
    const circuits = rows.map((row) => createCircuit(row, leftConnector, rightConnector));
    materials = [{
      id: generateId(),
      name: draft.attributes.drawingWireNo || '多芯护套线',
      position: { x: 330, y: 270 },
      width: lengthMmToCanvasWidth(totalLengthMm),
      spec: {
        kind: 'jacketed',
        jacketMaterial: 'PVC',
        jacketColor: 'black',
        awg: 22,
        coreCount: rows.length,
        shielded: true,
        odMm: calculateCableOd(22, rows.length, true),
        coreColors: rows.map((row) => row.color),
        endTreatment: {
          start: { stripped: false, termination: 'none' },
          end: { stripped: false, termination: 'none' },
        },
        lengthMm: totalLengthMm,
        ulNumber: 'UL2464',
      },
      circuits,
      expandedByDefault: true,
    }];
  } else {
    materials = rows.map((row, index) => ({
      id: generateId(),
      name: row.signalName?.trim() || `电子线 ${row.index}`,
      position: { x: 330, y: 150 + index * 26 },
      width: lengthMmToCanvasWidth(row.lengthMm ?? totalLengthMm),
      spec: {
        kind: 'electronic',
        color: row.color,
        lengthMm: row.lengthMm ?? totalLengthMm,
        awg: 22,
        ulNumber: '1007',
        endTreatment: {
          start: { stripped: false, termination: 'none' },
          end: isSingle && draft.attributes.tailTreatment?.stripTinLengthMm
            ? {
                stripped: true,
                stripLengthMm: draft.attributes.tailTreatment.stripTinLengthMm,
                termination: 'tinned',
              }
            : { stripped: false, termination: 'none' },
        },
      },
      circuits: [createCircuit(row, leftConnector, rightConnector)],
      expandedByDefault: false,
    }));
  }

  const nextConfig: HarnessConfig = {
    ...baseConfig,
    name: draft.attributes.drawingWireNo?.trim() || baseConfig.name || '线束制造图',
    connectors: [leftConnector, rightConnector].filter(
      (connector): connector is ConnectorInstance => Boolean(connector),
    ),
    materials,
    protectiveSleeves: draft.attributes.heatShrinkId
      ? [{
          id: generateId(),
          type: 'heat-shrink',
          position: { x: 420, y: 240 },
          width: lengthMmToCanvasWidth(Math.min(totalLengthMm, 40)),
          height: 36,
          lengthMm: Math.min(totalLengthMm, 40),
          attachedMaterialIds: materials.map((material) => material.id),
          remark: draft.attributes.heatShrinkId,
        }]
      : [],
    models: [],
    twoDImages: [],
    updatedAt: Date.now(),
  };

  return {
    ...nextConfig,
    productionDrawing: generateProductionDrawing(nextConfig, {
      drawingNo: draft.attributes.drawingWireNo || 'WH-NEW',
      lengthToleranceMm: draft.attributes.lengthToleranceMm,
      techRequirements: [
        `总长 ${totalLengthMm}±${draft.attributes.lengthToleranceMm ?? 0}mm。`,
        '所有端子压接后须进行拉力及导通检查。',
        '成品外观应无破损、露铜和错位。',
      ],
    }),
  };
}
