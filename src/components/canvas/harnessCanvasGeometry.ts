import type { Edge, Node } from '@xyflow/react';
import {
  CANVAS_MODEL_SIZE,
  getConnectorHeight,
  getConnectorNodeWidth,
  getConnectorPinHandlePosition,
  getMaterialEndpointPoint,
  placeSleeveAroundMaterials,
  segmentIntersectsRect,
  getVisiblePinCount,
} from '@/lib/canvasMaterials';
import { generateId, getActiveConnectorSide } from '@/lib/commands';
import type {
  CanvasModel,
  CanvasWireMaterial,
  ConnectorInstance,
  ConnectorSide,
  HarnessConfig,
  MaterialEndpoint,
} from '@/types/harness';

export function isValidCanvasViewport(
  vp: { x: number; y: number; zoom: number } | null | undefined,
): vp is { x: number; y: number; zoom: number } {
  return Boolean(
    vp &&
      Number.isFinite(vp.x) &&
      Number.isFinite(vp.y) &&
      Number.isFinite(vp.zoom) &&
      vp.zoom > 0,
  );
}

export function hasValidContainerDimensions(el: HTMLElement | null): boolean {
  return Boolean(el && el.clientWidth > 0 && el.clientHeight > 0);
}

export function parsePinFromHandleId(handleId?: string | null): number | undefined {
  if (!handleId) return undefined;
  const match = handleId.match(/pin-(\d+)$/);
  if (!match) return undefined;
  const pin = Number.parseInt(match[1], 10);
  return Number.isFinite(pin) && pin > 0 ? pin : undefined;
}

export function parseSideFromHandleId(handleId?: string | null): ConnectorSide | undefined {
  if (!handleId) return undefined;
  if (handleId.startsWith('left')) return 'left';
  if (handleId.startsWith('right')) return 'right';
  return undefined;
}

export function resolveNearestConnectorHandle(
  config: HarnessConfig,
  instance: ConnectorInstance,
  point: { x: number; y: number },
  preferredSide?: ConnectorSide,
): { handle: string; distance: number; pin: number; side: ConnectorSide } | undefined {
  const activeSide = getActiveConnectorSide(config, instance.id);
  const sides: ConnectorSide[] = activeSide ? [activeSide] : ['left', 'right'];
  const visiblePinCount = getVisiblePinCount(instance);

  let best: { handle: string; distance: number; pin: number; side: ConnectorSide } | undefined;

  for (const side of sides) {
    if (preferredSide && preferredSide !== side) continue;

    for (let pin = 1; pin <= visiblePinCount; pin += 1) {
      const pos = getConnectorPinHandlePosition(instance, side, pin);
      const distance = Math.hypot(point.x - pos.x, point.y - pos.y);
      if (!best || distance < best.distance) {
        best = { handle: `${side}-pin-${pin}`, distance, pin, side };
      }
    }
  }

  return best;
}

export function distanceToRect(
  point: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number },
): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

export function getModelRect(model: CanvasModel) {
  return {
    x: model.position.x,
    y: model.position.y,
    width: model.width,
    height: model.height,
  };
}

export function findModelPlacement(
  config: HarnessConfig,
  flowPosition: { x: number; y: number },
): { x: number; y: number } {
  let bestConnector: ConnectorInstance | undefined;
  let minDist = Infinity;

  for (const connector of config.connectors) {
    const cx = connector.position.x + getConnectorNodeWidth(connector) / 2;
    const cy = connector.position.y + getConnectorHeight(connector) / 2;
    const d = Math.hypot(cx - flowPosition.x, cy - flowPosition.y);
    if (d < minDist) {
      minDist = d;
      bestConnector = connector;
    }
  }

  if (bestConnector) {
    const activeSide = getActiveConnectorSide(config, bestConnector.id) ?? 'right';
    const modelY = bestConnector.position.y;
    const connectorWidth = getConnectorNodeWidth(bestConnector);

    if (activeSide === 'right') {
      return {
        x: bestConnector.position.x + connectorWidth + 8,
        y: modelY,
      };
    }
    return {
      x: bestConnector.position.x - CANVAS_MODEL_SIZE - 8,
      y: modelY,
    };
  }

  return {
    x: flowPosition.x - CANVAS_MODEL_SIZE / 2,
    y: flowPosition.y - CANVAS_MODEL_SIZE / 2,
  };
}

export function getAttachmentNumberTubes(
  material: CanvasWireMaterial,
  circuitId: string,
  endpoint: MaterialEndpoint,
  legacyRenderedMaterialIds: Set<string>,
) {
  const numberTubes = material.numberTubes ?? [];
  const boundNumberTubes = numberTubes.filter(
    (tube) => tube.circuitId === circuitId && tube.endpoint === endpoint,
  );
  const legacyNumberTubes = numberTubes.filter((tube) => !tube.circuitId && !tube.endpoint);

  if (legacyNumberTubes.length === 0 || legacyRenderedMaterialIds.has(material.id)) {
    return boundNumberTubes;
  }

  legacyRenderedMaterialIds.add(material.id);
  return [...boundNumberTubes, ...legacyNumberTubes];
}

export function buildEdges(config: HarnessConfig, canvasSelection: string | null): Edge[] {
  const edges: Edge[] = [];
  const legacyNumberTubeRenderedMaterialIds = new Set<string>();

  for (const material of config.materials) {
    for (const circuit of material.circuits) {
      if (circuit.start) {
        const edgeId = `${circuit.id}:start`;
        const numberTubes = getAttachmentNumberTubes(
          material,
          circuit.id,
          'start',
          legacyNumberTubeRenderedMaterialIds,
        );
        edges.push({
          id: edgeId,
          source: material.id,
          sourceHandle: 'start',
          target: circuit.start.connectorId,
          targetHandle: `${circuit.start.connectorSide}-pin-${circuit.start.pin}`,
          type: 'attachment',
          data: {
            materialId: material.id,
            circuitId: circuit.id,
            side: 'start' as const,
            routeOffset: circuit.route?.start,
            solid: material.spec.kind === 'jacketed',
            numberTubes: numberTubes.length > 0 ? numberTubes : undefined,
          },
          selected: canvasSelection === edgeId,
          reconnectable: 'target',
        });
      }
      if (circuit.end) {
        const edgeId = `${circuit.id}:end`;
        const numberTubes = getAttachmentNumberTubes(
          material,
          circuit.id,
          'end',
          legacyNumberTubeRenderedMaterialIds,
        );
        edges.push({
          id: edgeId,
          source: material.id,
          sourceHandle: 'end',
          target: circuit.end.connectorId,
          targetHandle: `${circuit.end.connectorSide}-pin-${circuit.end.pin}`,
          type: 'attachment',
          data: {
            materialId: material.id,
            circuitId: circuit.id,
            side: 'end' as const,
            routeOffset: circuit.route?.end,
            solid: material.spec.kind === 'jacketed',
            numberTubes: numberTubes.length > 0 ? numberTubes : undefined,
          },
          selected: canvasSelection === edgeId,
          reconnectable: 'target',
        });
      }
    }
  }

  for (const instance of config.connectors) {
    for (const jumper of instance.jumpers) {
      if (jumper.pins.length < 2) continue;
      const sortedPins = [...jumper.pins].sort((a, b) => a - b);
      const firstPin = sortedPins[0];
      const lastPin = sortedPins[sortedPins.length - 1];
      const edgeId = `jumper:${jumper.id}`;
      edges.push({
        id: edgeId,
        source: instance.id,
        sourceHandle: `${jumper.side}-pin-${firstPin}`,
        target: instance.id,
        targetHandle: `${jumper.side}-pin-${lastPin}`,
        type: 'jumper',
        data: { connectorId: instance.id, jumperId: jumper.id },
        selected: canvasSelection === edgeId,
      });
    }
  }

  return edges;
}

export function getMaterialConnectorIds(material: CanvasWireMaterial): Set<string> {
  const connectorIds = new Set<string>();
  for (const circuit of material.circuits) {
    if (circuit.start) connectorIds.add(circuit.start.connectorId);
    if (circuit.end) connectorIds.add(circuit.end.connectorId);
  }
  return connectorIds;
}

/**
 * Electronic wires form one display group when they share any connector.
 * Connected components are used so A↔B and B↔C also become one group.
 */
export function getElectronicMaterialGroups(materials: CanvasWireMaterial[]): Map<string, string[]> {
  const electronic = materials.filter((material) => material.spec.kind === 'electronic');
  const connectorIdsByMaterial = new Map(
    electronic.map((material) => [material.id, getMaterialConnectorIds(material)]),
  );
  const visited = new Set<string>();
  const result = new Map<string, string[]>();

  for (const material of electronic) {
    if (visited.has(material.id)) continue;
    const group: CanvasWireMaterial[] = [];
    const queue = [material];
    visited.add(material.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      group.push(current);
      const currentConnectors = connectorIdsByMaterial.get(current.id) ?? new Set<string>();
      for (const candidate of electronic) {
        if (visited.has(candidate.id)) continue;
        const candidateConnectors = connectorIdsByMaterial.get(candidate.id) ?? new Set<string>();
        if ([...currentConnectors].some((connectorId) => candidateConnectors.has(connectorId))) {
          visited.add(candidate.id);
          queue.push(candidate);
        }
      }
    }

    const sortedIds = group
      .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
      .map((item) => item.id);
    for (const materialId of sortedIds) result.set(materialId, sortedIds);
  }

  return result;
}

export function nodeStyleEqual(
  a: Node['style'] | undefined,
  b: Node['style'] | undefined,
) {
  const aWidth = a && 'width' in a ? a.width : undefined;
  const bWidth = b && 'width' in b ? b.width : undefined;
  const aHeight = a && 'height' in a ? a.height : undefined;
  const bHeight = b && 'height' in b ? b.height : undefined;
  return aWidth === bWidth && aHeight === bHeight;
}

export function canReuseNode(prev: Node | undefined, next: Node) {
  if (!prev) return false;
  return (
    prev.type === next.type
    && prev.selected === next.selected
    && prev.dragHandle === next.dragHandle
    && prev.zIndex === next.zIndex
    && prev.position.x === next.position.x
    && prev.position.y === next.position.y
    && prev.data === next.data
    && nodeStyleEqual(prev.style, next.style)
  );
}

export interface ModelLinkedGroup {
  modelId: string;
  connectorIds: Set<string>;
  materialIds: Set<string>;
}

export function getModelLinkedGroups(config: HarnessConfig): ModelLinkedGroup[] {
  return config.models.map((model) => {
    const rect = getModelRect(model);
    const connectorIds = new Set<string>();
    const materialIds = new Set<string>();

    for (const material of config.materials) {
      for (const circuit of material.circuits) {
        for (const endpoint of ['start', 'end'] as const) {
          const ref = circuit[endpoint];
          if (!ref) continue;
          const connector = config.connectors.find((item) => item.id === ref.connectorId);
          if (!connector) continue;
          if (
            segmentIntersectsRect(
              getMaterialEndpointPoint(material, endpoint),
              getConnectorPinHandlePosition(connector, ref.connectorSide, ref.pin),
              rect,
            )
          ) {
            materialIds.add(material.id);
            connectorIds.add(connector.id);
          }
        }
      }
    }

    return {
      modelId: model.id,
      connectorIds,
      materialIds,
    };
  });
}

export function getLinkedDragNodeIds(
  config: HarnessConfig,
  nodeId: string,
) {
  const groups = getModelLinkedGroups(config);
  if (groups.length === 0) return [nodeId];

  const sets = groups.map((g) => {
    const s = new Set<string>();
    s.add(g.modelId);
    for (const cid of g.connectorIds) s.add(cid);
    for (const mid of g.materialIds) s.add(mid);
    return s;
  });

  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        let hasOverlap = false;
        for (const item of sets[i]) {
          if (sets[j].has(item)) {
            hasOverlap = true;
            break;
          }
        }
        if (hasOverlap) {
          for (const item of sets[j]) {
            sets[i].add(item);
          }
          sets.splice(j, 1);
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }

  const matchedSet = sets.find((s) => s.has(nodeId));
  if (!matchedSet) return [nodeId];

  return [...matchedSet];
}

export function applyNodePositionsToConfig(
  config: HarnessConfig,
  positions: Map<string, { x: number; y: number }>,
) {
  const nextMaterials = config.materials.map((material) =>
    positions.has(material.id)
      ? { ...material, position: positions.get(material.id)! }
      : material,
  );
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
    connectors: config.connectors.map((connector) =>
      positions.has(connector.id)
        ? { ...connector, position: positions.get(connector.id)! }
        : connector,
    ),
    materials: nextMaterials,
    protectiveSleeves: nextProtectiveSleeves,
    models: config.models.map((model) =>
      positions.has(model.id)
        ? { ...model, position: positions.get(model.id)! }
        : model,
    ),
    updatedAt: Date.now(),
  };
}

export function getSleevePreviewUpdates(
  config: HarnessConfig,
  positions: Map<string, { x: number; y: number }>,
) {
  const nextMaterials = config.materials.map((material) =>
    positions.has(material.id)
      ? { ...material, position: positions.get(material.id)! }
      : material,
  );

  return new Map(
    config.protectiveSleeves.map((sleeve) => {
      const attachedMaterials = sleeve.attachedMaterialIds
        .map((materialId) => nextMaterials.find((material) => material.id === materialId))
        .filter((material): material is CanvasWireMaterial => Boolean(material));
      const placement = placeSleeveAroundMaterials(attachedMaterials, sleeve.width);
      return [
        sleeve.id,
        placement
          ? {
              position: placement.position,
              height: placement.height,
            }
          : {
              position: sleeve.position,
              height: sleeve.height || 36,
            },
      ] as const;
    }),
  );
}

export function materialDescriptionForOption(material: CanvasWireMaterial): string {
  return material.spec.kind === 'electronic'
    ? `电子线 · ${material.spec.color} · ${material.spec.lengthMm}mm`
    : `护套线 · ${material.spec.coreCount}芯 · ${material.spec.lengthMm}mm`;
}

export function createNextModelFromSelection(
  config: HarnessConfig,
  modelDialogPosition: { x: number; y: number },
  selection: Parameters<typeof import('../shared/OvermoldPickerDialog').OvermoldPickerDialog>[0]['onSelect'] extends (sel: infer S) => void ? S : never,
): CanvasModel {
  const placementPos = findModelPlacement(config, modelDialogPosition);

  let connectorHeight = CANVAS_MODEL_SIZE;
  let minDist = Infinity;
  for (const connector of config.connectors) {
    const cx = connector.position.x + getConnectorNodeWidth(connector) / 2;
    const cy = connector.position.y + getConnectorHeight(connector) / 2;
    const d = Math.hypot(cx - modelDialogPosition.x, cy - modelDialogPosition.y);
    if (d < minDist) {
      minDist = d;
      connectorHeight = getConnectorHeight(connector);
    }
  }

  return {
    id: generateId(),
    kind: 'outer-box',
    position: placementPos,
    width: CANVAS_MODEL_SIZE,
    height: connectorHeight,
    overmoldSpecId: selection.overmold.id,
    includeInnerMold: selection.includeInnerMold,
    resourceItemId: selection.overmold.resourceItemId,
    resourceImageUrl: selection.overmold.image,
  };
}
