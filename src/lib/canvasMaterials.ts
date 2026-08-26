import type {
  CanvasModel,
  CanvasWireMaterial,
  CanvasWireSpec,
  CorrugatedMaterial,
  JacketCoreCount,
  JacketUlNumber,
  ProtectiveSleeve,
  WireEndProcessing,
  WireEndTreatment,
  ConnectorInstance,
  ConnectorSide,
  MaterialEndpoint,
  HarnessConfig,
  Selection,
} from '@/types/harness';
import type { CatalogSnapshot } from '@/types/catalog';
import { syncConnectorLabels } from '@/lib/connectorDesignation';

export const JACKET_CORE_COUNTS: JacketCoreCount[] = [
  1, 2, 3, 4, 5, 6, 8, 12, 17, 20, 24, 30, 32, 40, 50,
];

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
  '金色',
  '粉色',
  '黄注绿',
  '浅蓝色',
  '黄绿色',
  '米白色',
  '深蓝色',
  '浅绿色',
  '空白',
  '透明',
] as const;

const CORE_COLOR_SEQUENCE = [...CORE_COLOR_OPTIONS];

import { getCatalogSnapshot } from '@/lib/catalogRuntime';

// Additional Chinese names not in WIRE_COLORS that appear in CORE_COLOR_OPTIONS.
const EXTRA_CORE_COLOR_HEX: Record<string, string> = {
  '金色': '#D4AF37',
  '黄注绿': '#A3E635',
  '浅蓝色': '#7DD3FC',
  '黄绿色': '#A3E635',
  '米白色': '#F5F0E8',
  '深蓝色': '#1E3A8A',
  '浅绿色': '#86EFAC',
  '空白': '#F8FAFC',
  '透明': '#E2E8F066',
};

/**
 * Resolve a color value that may be either:
 *   - an English WIRE_COLORS id (e.g. 'red', 'gray')
 *   - a Chinese display name from CORE_COLOR_OPTIONS (e.g. '红色', '灰色')
 * Returns { hex, name } for display.
 */
export function resolveColor(value: string): { hex: string; name: string } {
  const wireColors = getCatalogSnapshot()?.wireColors ?? [];
  // Try English ID first (electronic wires)
  const byId = wireColors.find((c) => c.id === value);
  if (byId) return { hex: byId.hex, name: byId.name };
  // Try Chinese name (jacketed core colors)
  const byName = wireColors.find((color) => color.name === value);
  if (byName) return { hex: byName.hex, name: byName.name };
  // Extra names not in WIRE_COLORS
  const extraHex = EXTRA_CORE_COLOR_HEX[value];
  if (extraHex) return { hex: extraHex, name: value };
  // Fallback
  return { hex: '#6B7280', name: value || '灰色' };
}

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

/**
 * Unified display name for a protective sleeve.
 * Corrugated sleeves include their material (e.g. "PA波纹管").
 * All UI surfaces (canvas, BOM, quote) should use this function.
 */
export function getProtectiveSleeveDisplayName(sleeve: ProtectiveSleeve): string {
  const option = getCatalogSnapshot()?.protectionOptions.find((item) => item.id === sleeve.type);
  const baseName = option?.name ?? sleeve.type;
  if (sleeve.type !== 'corrugated') return baseName;
  const materialLabel = sleeve.corrugatedMaterial
    ? CORRUGATED_MATERIAL_SHORT_LABELS[sleeve.corrugatedMaterial]
    : undefined;
  return materialLabel ? `${materialLabel} ${baseName}` : baseName;
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

export function calculateProtectiveSleevePrice(sleeve: ProtectiveSleeve, catalog: CatalogSnapshot | null = getCatalogSnapshot()): number {
  const option = catalog?.protectionOptions.find((item) => item.id === sleeve.type);
  const pricePerMeter = option?.price ?? 0;
  const materialMultiplier =
    sleeve.type === 'corrugated' && sleeve.corrugatedMaterial
      ? (option?.materialMultipliers[sleeve.corrugatedMaterial] ?? 1)
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
  return Array.from(
    { length: Math.max(1, Math.min(100, Math.floor(coreCount))) },
    (_, index) => CORE_COLOR_SEQUENCE[index % CORE_COLOR_SEQUENCE.length],
  );
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

export function getConnectorNodeWidth(_instance: ConnectorInstance | undefined | null): number {
  void _instance;
  return 266;
}

export function getConnectorHeight(instance: ConnectorInstance): number {
  const pinCount = instance.connector?.pinCount ?? 2;
  return 92 + pinCount * 20 + 32;
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

export function alignHarnessConfig(config: HarnessConfig, selection?: Selection): HarnessConfig {
  const nextConnectors = config.connectors.map(c => ({ ...c, position: { ...c.position } }));
  const nextModels = config.models.map(m => ({ ...m, position: { ...m.position } }));
  const nextMaterials = config.materials.map(m => ({ ...m, position: { ...m.position } }));
  const gap = 8;

  // 1. Get linkages for all models
  const linkages: Record<string, MoldLinkage> = {};
  for (const model of nextModels) {
    const linkage = getMoldLinkage(model, config);
    if (linkage) {
      linkages[model.id] = linkage;
    }
  }

  // 2. Build graph adjacency list
  // Node IDs: 'connector:<id>', 'model:<id>', 'material:<id>'
  interface AdjEdge {
    to: string;
    type: 'connector-model' | 'model-material' | 'material-model' | 'model-connector';
    metadata: {
      side?: ConnectorSide;
      endpoint?: MaterialEndpoint;
      materialIds?: string[];
    };
  }
  const adj: Record<string, AdjEdge[]> = {};

  const addEdge = (u: string, v: string, type: AdjEdge['type'], metadata: AdjEdge['metadata']) => {
    if (!adj[u]) adj[u] = [];
    adj[u].push({ to: v, type, metadata });
  };

  for (const model of nextModels) {
    const linkage = linkages[model.id];
    if (!linkage) continue;

    const { connector, side, materials } = linkage;
    const mNode = `model:${model.id}`;
    const cNode = `connector:${connector.id}`;

    addEdge(cNode, mNode, 'connector-model', { side });
    addEdge(mNode, cNode, 'model-connector', { side });

    for (const mat of materials) {
      const wNode = `material:${mat.id}`;
      // For model -> material:
      addEdge(mNode, wNode, 'model-material', { side, materialIds: materials.map(m => m.id) });
      
      // For material -> model, find which endpoint of mat is connected to this connector:
      let endpoint: MaterialEndpoint = 'start';
      for (const circuit of mat.circuits) {
        if (circuit.start?.connectorId === connector.id) {
          endpoint = 'start';
          break;
        }
        if (circuit.end?.connectorId === connector.id) {
          endpoint = 'end';
          break;
        }
      }
      addEdge(wNode, mNode, 'material-model', { endpoint, materialIds: materials.map(m => m.id) });
    }
  }

  // 3. Find connected components
  const allNodes = new Set<string>();
  for (const c of nextConnectors) allNodes.add(`connector:${c.id}`);
  for (const m of nextModels) allNodes.add(`model:${m.id}`);
  for (const w of nextMaterials) allNodes.add(`material:${w.id}`);

  const visited = new Set<string>();
  const components: string[][] = [];

  for (const node of allNodes) {
    if (visited.has(node)) continue;
    const comp: string[] = [];
    const queue: string[] = [node];
    visited.add(node);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      comp.push(curr);
      const neighbors = adj[curr] || [];
      for (const edge of neighbors) {
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
    components.push(comp);
  }

  // 4. Align each component
  const alignedPositions: Record<string, { x: number; y: number; height?: number }> = {};

  for (const comp of components) {
    if (comp.length <= 1) continue; // Single isolated element, no alignment needed

    // Choose anchor
    let anchor = '';
    if (selection && selection.kind !== 'none') {
      const selNode = `${selection.kind}:${selection.id}`;
      if (comp.includes(selNode)) {
        anchor = selNode;
      }
    }

    if (!anchor) {
      // Find connectors in component
      const connectorsInComp = comp.filter(n => n.startsWith('connector:'));
      if (connectorsInComp.length > 0) {
        // Sort by current x position, pick leftmost
        connectorsInComp.sort((a, b) => {
          const aId = a.split(':')[1];
          const bId = b.split(':')[1];
          const ax = nextConnectors.find(c => c.id === aId)?.position.x ?? 0;
          const bx = nextConnectors.find(c => c.id === bId)?.position.x ?? 0;
          return ax - bx;
        });
        anchor = connectorsInComp[0];
      } else {
        // Pick leftmost material
        const materialsInComp = comp.filter(n => n.startsWith('material:'));
        materialsInComp.sort((a, b) => {
          const aId = a.split(':')[1];
          const bId = b.split(':')[1];
          const ax = nextMaterials.find(m => m.id === aId)?.position.x ?? 0;
          const bx = nextMaterials.find(m => m.id === bId)?.position.x ?? 0;
          return ax - bx;
        });
        anchor = materialsInComp[0] || comp[0];
      }
    }

    // Initialize anchor position
    const [anchorKind, anchorId] = anchor.split(':');
    let anchorPos = { x: 0, y: 0 };
    if (anchorKind === 'connector') {
      const conn = nextConnectors.find(c => c.id === anchorId)!;
      anchorPos = { ...conn.position };
    } else if (anchorKind === 'model') {
      const model = nextModels.find(m => m.id === anchorId)!;
      anchorPos = { ...model.position };
    } else if (anchorKind === 'material') {
      const mat = nextMaterials.find(m => m.id === anchorId)!;
      anchorPos = { ...mat.position };
    }
    alignedPositions[anchor] = anchorPos;

    // Traverse component to position all other nodes
    const compVisited = new Set<string>([anchor]);
    const queue: string[] = [anchor];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const currPos = alignedPositions[curr];
      const currId = curr.split(':')[1];

      const neighbors = adj[curr] || [];
      for (const edge of neighbors) {
        if (compVisited.has(edge.to)) continue;
        compVisited.add(edge.to);

        const nextNode = edge.to;
        const nextId = nextNode.split(':')[1];

        if (edge.type === 'connector-model') {
          const conn = nextConnectors.find(c => c.id === currId)!;
          const model = nextModels.find(m => m.id === nextId)!;
          const side = edge.metadata.side;
          const connWidth = getConnectorNodeWidth(conn);
          const connHeight = getConnectorHeight(conn);

          const nextX = side === 'right'
            ? currPos.x + connWidth + gap
            : currPos.x - model.width - gap;
          const nextY = currPos.y;

          alignedPositions[nextNode] = { x: nextX, y: nextY, height: connHeight };
        }
        else if (edge.type === 'model-connector') {
          const model = nextModels.find(m => m.id === currId)!;
          const conn = nextConnectors.find(c => c.id === nextId)!;
          const side = edge.metadata.side;
          const connWidth = getConnectorNodeWidth(conn);

          const nextX = side === 'right'
            ? currPos.x - connWidth - gap
            : currPos.x + model.width + gap;
          const nextY = currPos.y;

          alignedPositions[nextNode] = { x: nextX, y: nextY };
        }
        else if (edge.type === 'model-material') {
          const model = nextModels.find(m => m.id === currId)!;
          const side = edge.metadata.side;
          const materialIds = edge.metadata.materialIds || [];
          const groupMaterials = nextMaterials.filter(m => materialIds.includes(m.id));

          const modelHeight = currPos.height ?? model.height;
          const connectorCenterY = currPos.y + modelHeight / 2;

          if (groupMaterials.length > 0) {
            const minY = Math.min(...groupMaterials.map(m => m.position.y));
            const maxY = Math.max(...groupMaterials.map(m => m.position.y + getMaterialNodeHeight(m.spec.kind)));
            const groupCenterY = (minY + maxY) / 2;
            const deltaY = connectorCenterY - groupCenterY;

            for (const mat of groupMaterials) {
              const matNode = `material:${mat.id}`;
              if (compVisited.has(matNode) && matNode !== nextNode) continue;
              
              const nextX = side === 'right'
                ? currPos.x + model.width + gap
                : currPos.x - gap - mat.width;
              const nextY = mat.position.y + deltaY;

              alignedPositions[matNode] = { x: nextX, y: nextY };
              compVisited.add(matNode);
              queue.push(matNode);
            }
          }
          continue;
        }
        else if (edge.type === 'material-model') {
          const mat = nextMaterials.find(m => m.id === currId)!;
          const model = nextModels.find(m => m.id === nextId)!;
          const endpoint = edge.metadata.endpoint;
          const materialIds = edge.metadata.materialIds || [];
          const groupMaterials = nextMaterials.filter(m => materialIds.includes(m.id));

          if (groupMaterials.length > 0) {
            const minY = Math.min(...groupMaterials.map(m => m.position.y));
            const maxY = Math.max(...groupMaterials.map(m => m.position.y + getMaterialNodeHeight(m.spec.kind)));
            const groupCenterY = (minY + maxY) / 2;

            const modelHeight = getConnectorHeight(linkages[model.id].connector);
            const nextX = endpoint === 'start'
              ? currPos.x - model.width - gap
              : currPos.x + mat.width + gap;
            const nextY = groupCenterY - modelHeight / 2;

            alignedPositions[nextNode] = { x: nextX, y: nextY, height: modelHeight };
          }
        }

        queue.push(nextNode);
      }
    }
  }

  // 5. Apply the aligned positions back to connectors, models, and materials
  for (const c of nextConnectors) {
    const pos = alignedPositions[`connector:${c.id}`];
    if (pos) {
      c.position = { x: pos.x, y: pos.y };
    }
  }
  for (const m of nextModels) {
    const pos = alignedPositions[`model:${m.id}`];
    if (pos) {
      m.position = { x: pos.x, y: pos.y };
      if (pos.height !== undefined) {
        m.height = pos.height;
      }
    }
  }
  for (const mat of nextMaterials) {
    const pos = alignedPositions[`material:${mat.id}`];
    if (pos) {
      mat.position = { x: pos.x, y: pos.y };
    }
  }

  // 6. Recalculate protective sleeves
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

  return syncConnectorLabels({
    ...config,
    connectors: nextConnectors,
    models: nextModels,
    materials: nextMaterials,
    protectiveSleeves: nextProtectiveSleeves,
  });
}
