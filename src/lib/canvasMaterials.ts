import type {
  CanvasModel,
  CanvasWireMaterial,
  CanvasWireSpec,
  CorrugatedMaterial,
  JacketCoreCount,
  JacketUlNumber,
  ProtectiveSleeve,
  ProtectiveSleeveType,
  WireEndProcessing,
  WireEndTreatment,
  ConnectorInstance,
  ConnectorSide,
  MaterialEndpoint,
  HarnessConfig,
} from '@/types/harness';

export const JACKET_CORE_COUNTS: JacketCoreCount[] = [1, 2, 3, 4, 5, 6, 8, 12, 17];

/** Allowed UL numbers for jacketed wires (single-select, may be absent). */
export const JACKET_UL_NUMBERS: JacketUlNumber[] = ['UL2464', 'UL20276'];

export const CORE_COLOR_OPTIONS = [
  '红色',
  '黑色',
  '白色',
  '绿色',
  '黄色',
  '蓝色',
  '棕色',
  '橙色',
  '灰色',
  '紫色',
  '粉色',
  '浅蓝色',
  '黄绿色',
  '米白色',
  '深蓝色',
  '浅绿色',
  '透明',
] as const;

const CORE_COLOR_SEQUENCE = [...CORE_COLOR_OPTIONS];

export const PROTECTIVE_SLEEVE_LABELS: Record<ProtectiveSleeveType, string> = {
  'acetate-cloth': '醋酸布',
  fleece: '绒布',
  'heat-shrink': '热缩管',
  braided: '编织网管',
  corrugated: '波纹管',
};

export const PROTECTIVE_SLEEVE_PRICE_PER_METER: Record<ProtectiveSleeveType, number> = {
  'acetate-cloth': 2.2,
  fleece: 2.8,
  'heat-shrink': 1.67,
  braided: 3.33,
  corrugated: 4.0,
};

export const CORRUGATED_MATERIAL_LABELS: Record<CorrugatedMaterial, string> = {
  PP: 'PP（聚丙烯）',
  PA: 'PA（尼龙）',
  'stainless-steel': '不锈钢',
};

export const CORRUGATED_MATERIAL_SHORT_LABELS: Record<CorrugatedMaterial, string> = {
  PP: 'PP',
  PA: 'PA',
  'stainless-steel': '不锈钢',
};

export const CORRUGATED_MATERIAL_PRICE_MULTIPLIER: Record<CorrugatedMaterial, number> = {
  PP: 1.0,
  PA: 1.4,
  'stainless-steel': 3.2,
};

/**
 * Unified display name for a protective sleeve.
 * Corrugated sleeves include their material (e.g. "PA波纹管").
 * All UI surfaces (canvas, BOM, quote) should use this function.
 */
export function getProtectiveSleeveDisplayName(sleeve: ProtectiveSleeve): string {
  if (sleeve.type !== 'corrugated') {
    return PROTECTIVE_SLEEVE_LABELS[sleeve.type];
  }
  const materialLabel = sleeve.corrugatedMaterial
    ? CORRUGATED_MATERIAL_SHORT_LABELS[sleeve.corrugatedMaterial]
    : '未指定材质';
  return `${materialLabel}波纹管`;
}

export const CANVAS_MATERIAL_HEIGHT = 22;
export const CANVAS_MATERIAL_STRIP_TOP = 0;
export const CANVAS_MATERIAL_STRIP_PADDING_Y = 6;
export const CANVAS_MATERIAL_STRIP_HEIGHT = 10;
// Shared with WireMaterialNode so the sleeve snaps to the exact visual center of the strip.
export const CANVAS_MATERIAL_SLEEVE_CENTER_Y =
  CANVAS_MATERIAL_STRIP_TOP + CANVAS_MATERIAL_STRIP_PADDING_Y + CANVAS_MATERIAL_STRIP_HEIGHT / 2;
export const PROTECTIVE_SLEEVE_HEIGHT = 36;
export const PROTECTIVE_SLEEVE_VERTICAL_PADDING = 8;
export const CANVAS_MODEL_SIZE = 84;
export const CONNECTOR_NODE_WIDTH = 236;
export const CORRUGATED_ENDCAP_WIDTH = 16;
export const CORRUGATED_ENDCAP_HEIGHT = 18;

/** Unified mm -> canvas-px scale used by both wire materials and protective sleeves. */
export function lengthMmToCanvasWidth(lengthMm: number): number {
  return Math.max(40, Math.min(600, lengthMm * 0.6));
}

/**
 * Position an attached sleeve around the visual center line of a material.
 * This is the single source of truth for create, resize, move, and edit flows.
 */
export function getMaterialCenterY(kind: 'electronic' | 'jacketed'): number {
  return kind === 'electronic' ? 11 : 21;
}

export function getMaterialNodeHeight(kind: 'electronic' | 'jacketed'): number {
  return kind === 'electronic' ? 22 : 42;
}

export function getMaterialStripHeight(kind: 'electronic' | 'jacketed'): number {
  return kind === 'electronic' ? 10 : 30;
}

/**
 * Position an attached sleeve around the visual center line of a material.
 * This is the single source of truth for create, resize, move, and edit flows.
 */
export function centerSleeveOnMaterial(
  material: Pick<CanvasWireMaterial, 'position' | 'width' | 'spec'>,
  sleeveWidth: number,
): { x: number; y: number } {
  return {
    x: material.position.x + (material.width - sleeveWidth) / 2,
    y: material.position.y + getMaterialCenterY(material.spec.kind) - PROTECTIVE_SLEEVE_HEIGHT / 2,
  };
}

/**
 * Position a protective sleeve around any selected subset of wires.
 * The selected wire centers determine the vertical span, so one sleeve
 * can cover two wires, four wires, or any other explicit combination.
 */
export function placeSleeveAroundMaterials(
  materials: Array<Pick<CanvasWireMaterial, 'position' | 'width' | 'spec'>>,
  sleeveWidth: number,
): { position: { x: number; y: number }; height: number } | undefined {
  if (materials.length === 0) return undefined;

  const centers = materials.map((material) => ({
    x: material.position.x + material.width / 2,
    y: material.position.y + getMaterialCenterY(material.spec.kind),
  }));
  const centerX = centers.reduce((sum, point) => sum + point.x, 0) / centers.length;
  const minY = Math.min(...centers.map((point) => point.y));
  const maxY = Math.max(...centers.map((point) => point.y));
  const maxStripHeight = Math.max(...materials.map(m => getMaterialStripHeight(m.spec.kind)));
  const height = Math.max(
    PROTECTIVE_SLEEVE_HEIGHT,
    maxY - minY + maxStripHeight + PROTECTIVE_SLEEVE_VERTICAL_PADDING * 2,
  );

  return {
    position: {
      x: centerX - sleeveWidth / 2,
      y: (minY + maxY) / 2 - height / 2,
    },
    height,
  };
}

/** @deprecated Use lengthMmToCanvasWidth */
export function sleeveLengthToCanvasWidth(lengthMm: number): number {
  return lengthMmToCanvasWidth(lengthMm);
}

export function calculateProtectiveSleevePrice(sleeve: ProtectiveSleeve): number {
  const pricePerMeter = PROTECTIVE_SLEEVE_PRICE_PER_METER[sleeve.type] ?? 0;
  const materialMultiplier =
    sleeve.type === 'corrugated' && sleeve.corrugatedMaterial
      ? (CORRUGATED_MATERIAL_PRICE_MULTIPLIER[sleeve.corrugatedMaterial] ?? 1)
      : 1;
  return pricePerMeter * materialMultiplier * (sleeve.lengthMm / 1000);
}

export function getCanvasModelDisplayName(model: CanvasModel): string {
  return model.kind === 'outer-box' ? '方块外模' : '外模';
}

export function getCoreColors(coreCount: JacketCoreCount): string[] {
  // 4芯护套线使用标准电话线颜色：棕白蓝黑
  if (coreCount === 4) {
    return ['棕色', '白色', '蓝色', '黑色'];
  }
  return CORE_COLOR_SEQUENCE.slice(0, coreCount);
}

export function createDefaultWireEndProcessing(): WireEndProcessing {
  return {
    stripped: false,
    termination: 'none',
  };
}

export function createDefaultWireEndTreatment(): WireEndTreatment {
  return {
    start: createDefaultWireEndProcessing(),
    end: createDefaultWireEndProcessing(),
  };
}

export function getWireEndTreatmentSummary(endTreatment: WireEndTreatment): string {
  const formatEnd = (label: string, end: WireEndProcessing) => {
    if (!end.stripped) return `${label}不剥皮`;
    const strip = `剥皮${end.stripLengthMm ?? 0}mm`;
    if (end.termination === 'tinned') return `${label}${strip}后沾锡`;
    if (end.termination === 'terminal') return `${label}${strip}后打端子`;
    return `${label}${strip}`;
  };

  return `${formatEnd('左端', endTreatment.start)} / ${formatEnd('右端', endTreatment.end)}`;
}

export function calculateCableOd(awg: number, coreCount: JacketCoreCount, shielded: boolean): number {
  const safeAwg = Math.min(40, Math.max(4, awg));
  const conductorDiameter = 0.127 * Math.pow(92, (36 - safeAwg) / 39);
  const insulatedCoreDiameter = conductorDiameter * 1.35 + 0.45;
  const bundleDiameter = insulatedCoreDiameter * Math.sqrt(coreCount) * 1.12;
  const estimatedOd = bundleDiameter + 1.55 + (shielded ? 0.35 : 0);
  return Math.round(estimatedOd * 100) / 100;
}

export function createDefaultWireSpec(): CanvasWireSpec {
  return {
    kind: 'electronic',
    color: 'red',
    lengthMm: 300,
    awg: 26,
    ulNumber: '1007',
    endTreatment: createDefaultWireEndTreatment(),
  };
}

export function createDefaultCanvasMaterial(
  id: string,
  position: { x: number; y: number },
): CanvasWireMaterial {
  const spec = createDefaultWireSpec();
  return {
    id,
    name: '新线材',
    position,
    width: lengthMmToCanvasWidth(spec.lengthMm),
    spec,
    circuits: [],
    expandedByDefault: true,
  };
}

export function getConnectorNodeWidth(instance: ConnectorInstance | undefined | null): number {
  if (!instance) return 236;
  const labelLength = instance.label?.length || 0;
  const nameLength = instance.connector?.name?.length || 0;
  const labelWidth = labelLength * 8 + 40;
  const nameWidth = nameLength * 6.5 + 40;
  const maxContentWidth = Math.max(labelWidth, nameWidth);
  return Math.max(236, maxContentWidth);
}

export function getConnectorHeight(instance: ConnectorInstance): number {
  const pinCount = instance.connector?.pinCount ?? 2;
  return 52 + pinCount * 20 + 32;
}

export function getVisiblePinCount(instance: ConnectorInstance): number {
  return instance.connector?.pinCount ?? 2;
}

export function getMaterialEndpointPoint(
  material: CanvasWireMaterial,
  endpoint: MaterialEndpoint,
): { x: number; y: number } {
  return {
    x: endpoint === 'start' ? material.position.x : material.position.x + material.width,
    y: material.position.y + getMaterialCenterY(material.spec.kind),
  };
}

export function getConnectorPinHandlePosition(
  instance: ConnectorInstance,
  side: ConnectorSide,
  pin: number,
): { x: number; y: number } {
  const clampedPin = Math.max(1, Math.min(pin, getVisiblePinCount(instance)));
  return {
    x: instance.position.x + (side === 'left' ? 0 : getConnectorNodeWidth(instance)),
    y: instance.position.y + 52 + (clampedPin - 0.5) * 20,
  };
}

export function pointInRect(point: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }) {
  return (
    point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height
  );
}

function ccw(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
  return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
}

export function segmentsIntersect(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
) {
  return ccw(a1, b1, b2) !== ccw(a2, b1, b2) && ccw(a1, a2, b1) !== ccw(a1, a2, b2);
}

export function segmentIntersectsRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number },
) {
  if (pointInRect(start, rect) || pointInRect(end, rect)) return true;

  const topLeft = { x: rect.x, y: rect.y };
  const topRight = { x: rect.x + rect.width, y: rect.y };
  const bottomLeft = { x: rect.x, y: rect.y + rect.height };
  const bottomRight = { x: rect.x + rect.width, y: rect.y + rect.height };

  return (
    segmentsIntersect(start, end, topLeft, topRight)
    || segmentsIntersect(start, end, topRight, bottomRight)
    || segmentsIntersect(start, end, bottomRight, bottomLeft)
    || segmentsIntersect(start, end, bottomLeft, topLeft)
  );
}

export interface MoldLinkage {
  connector: ConnectorInstance;
  side: ConnectorSide;
  materials: CanvasWireMaterial[];
}

export function getMoldLinkage(
  model: CanvasModel,
  config: HarnessConfig,
): MoldLinkage | null {
  const rect = {
    x: model.position.x,
    y: model.position.y,
    width: model.width,
    height: model.height,
  };
  
  let linkedConnector: ConnectorInstance | null = null;
  let linkedSide: ConnectorSide | null = null;
  const linkedMaterials: CanvasWireMaterial[] = [];

  for (const material of config.materials) {
    let materialLinked = false;
    for (const circuit of material.circuits) {
      for (const endpoint of ['start', 'end'] as const) {
        const ref = circuit[endpoint];
        if (!ref) continue;
        const connector = config.connectors.find((item) => item.id === ref.connectorId);
        if (!connector) continue;
        
        const p1 = getMaterialEndpointPoint(material, endpoint);
        const p2 = getConnectorPinHandlePosition(connector, ref.connectorSide, ref.pin);
        
        if (segmentIntersectsRect(p1, p2, rect)) {
          materialLinked = true;
          if (!linkedConnector) {
            linkedConnector = connector;
            linkedSide = ref.connectorSide;
          }
        }
      }
    }
    if (materialLinked) {
      linkedMaterials.push(material);
    }
  }

  if (linkedConnector && linkedSide) {
    return {
      connector: linkedConnector,
      side: linkedSide,
      materials: linkedMaterials,
    };
  }

  return null;
}

export function alignHarnessConfig(config: HarnessConfig): HarnessConfig {
  const nextModels = [...config.models];
  const nextMaterials = config.materials.map(m => ({ ...m, position: { ...m.position } }));
  const gap = 8;
  
  for (let i = 0; i < nextModels.length; i++) {
    const model = nextModels[i];
    const linkage = getMoldLinkage(model, config);
    if (linkage) {
      const { connector, side, materials } = linkage;
      const connectorHeight = getConnectorHeight(connector);
      const connectorWidth = getConnectorNodeWidth(connector);
      
      const nextModel = {
        ...model,
        height: connectorHeight,
        position: {
          ...model.position,
          y: connector.position.y,
        },
      };
      
      if (side === 'right') {
        nextModel.position.x = connector.position.x + connectorWidth + gap;
        const materialStartX = nextModel.position.x + nextModel.width + gap;
        const connectorCenterY = connector.position.y + connectorHeight / 2;
        
        const materialIds = new Set(materials.map(m => m.id));
        const groupMaterials = nextMaterials.filter(m => materialIds.has(m.id));
        if (groupMaterials.length > 0) {
          const minY = Math.min(...groupMaterials.map(m => m.position.y));
          const maxY = Math.max(...groupMaterials.map(m => m.position.y + getMaterialNodeHeight(m.spec.kind)));
          const materialsCenterY = (minY + maxY) / 2;
          const deltaY = connectorCenterY - materialsCenterY;
          
          for (const m of nextMaterials) {
            if (materialIds.has(m.id)) {
              m.position.x = materialStartX;
              m.position.y += deltaY;
            }
          }
        }
      } else {
        nextModel.position.x = connector.position.x - nextModel.width - gap;
        const connectorCenterY = connector.position.y + connectorHeight / 2;
        
        const materialIds = new Set(materials.map(m => m.id));
        const groupMaterials = nextMaterials.filter(m => materialIds.has(m.id));
        if (groupMaterials.length > 0) {
          const minY = Math.min(...groupMaterials.map(m => m.position.y));
          const maxY = Math.max(...groupMaterials.map(m => m.position.y + getMaterialNodeHeight(m.spec.kind)));
          const materialsCenterY = (minY + maxY) / 2;
          const deltaY = connectorCenterY - materialsCenterY;
          
          for (const m of nextMaterials) {
            if (materialIds.has(m.id)) {
              m.position.x = nextModel.position.x - gap - m.width;
              m.position.y += deltaY;
            }
          }
        }
      }
      
      nextModels[i] = nextModel;
    }
  }

  const nextProtectiveSleeves = config.protectiveSleeves.map((sleeve) => {
    const attachedMaterials = sleeve.attachedMaterialIds
      .map((materialId) => nextMaterials.find((material) => material.id === materialId))
      .filter((material): material is CanvasWireMaterial => Boolean(material));
    const placement = placeSleeveAroundMaterials(attachedMaterials, sleeve.width);
    if (!placement) {
      return {
        ...sleeve,
        attachedMaterialIds: [],
        height: sleeve.height || 36,
      };
    }
    return {
      ...sleeve,
      position: placement.position,
      height: placement.height,
    };
  });

  return {
    ...config,
    models: nextModels,
    materials: nextMaterials,
    protectiveSleeves: nextProtectiveSleeves,
  };
}
