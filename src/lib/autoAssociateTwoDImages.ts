/**
 * 2D成品图图元自动关联与定向计算模块。
 *
 * - 连接器（Connector）：严格根据物料库中配置的 `imageVariants`（before / after / pinMap）独立生成图元，
 *   取消所有向普通单图或 `image_path` 的回退。外模连接状态决定主体图（未注塑用 before，已注塑用 after）。
 * - 线材（Wire）与外模（Overmold）：继续使用物料库中各自对应的物料图片。
 * - 旋转与方位：由线束拓扑（左/右/下）与外模形态（直头/弯头）实时计算驱动。
 */
import type { CanvasModel, CanvasWireMaterial, ConnectorInstance, ConnectorOrientation, HarnessConfig, JacketedWireSpec, OvermoldSpec, TwoDImage } from '@/types/harness';
import { generateId } from '@/lib/commands';
import { getCatalogSnapshot } from '@/lib/catalogRuntime';
import { getConnectorNodeWidth, getMoldLinkage } from '@/lib/canvasMaterials';

export { type ConnectorOrientation };

function resourceImage(
  name: string,
  dataUrl: string,
  elementKind: TwoDImage['elementKind'],
  elementId: string,
  previous: TwoDImage | undefined,
  imageRole: TwoDImage['imageRole'] = 'primary',
  rotation: 0 | 90 | 180 | 270 | -90 = 0,
  orientation?: ConnectorOrientation,
): TwoDImage {
  return {
    id: previous?.id ?? generateId(),
    name,
    dataUrl,
    source: 'catalog',
    imageRole,
    elementKind,
    elementId,
    orientation,
    rotation,
    ...(previous?.pos === undefined ? {} : { pos: previous.pos }),
  };
}

export function findLinkedModelForConnector(connector: ConnectorInstance, config: HarnessConfig): CanvasModel | undefined {
  for (const model of config.models) {
    const linkage = getMoldLinkage(model, config);
    if (linkage && linkage.connector.id === connector.id) {
      return model;
    }
  }
  // Fallback: 尚未接线时的几何靠近匹配
  const connectorLeft = connector.position.x;
  const connectorRight = connector.position.x + getConnectorNodeWidth(connector);
  return config.models.find((model) => {
    const modelLeft = model.position.x;
    const modelRight = model.position.x + model.width;
    const horizontallyClose = modelLeft < connectorRight + 120 && modelRight > connectorLeft - 120;
    return horizontallyClose && Math.abs(model.position.y - connector.position.y) < 200;
  });
}

export function isConnectorConnectedToModel(connector: ConnectorInstance, config: HarnessConfig): boolean {
  return findLinkedModelForConnector(connector, config) !== undefined;
}

export function getConnectedOvermoldSpec(model: CanvasModel): OvermoldSpec | undefined {
  const snapshot = getCatalogSnapshot();
  return snapshot?.overmolds.find((item) =>
    (model.resourceItemId && item.resourceItemId === model.resourceItemId) ||
    (model.overmoldSpecId && item.id === model.overmoldSpecId),
  );
}

function getMaterialCenterX(material: CanvasWireMaterial): number {
  return material.position.x + material.width / 2;
}

function getNearestMaterialByY(y: number, materials: CanvasWireMaterial[]): CanvasWireMaterial | undefined {
  return [...materials].sort((a, b) => Math.abs(a.position.y - y) - Math.abs(b.position.y - y))[0];
}

export function getConnectorOrientation(connector: ConnectorInstance, config: HarnessConfig): ConnectorOrientation {
  // 1. 若连接了弯头外模，强制判定为 bottom（-90° 出线朝上）
  const connectedModel = findLinkedModelForConnector(connector, config);
  if (connectedModel) {
    const overmoldSpec = getConnectedOvermoldSpec(connectedModel);
    if (overmoldSpec?.outerForm === 'bent') {
      return 'bottom';
    }
  }

  // 2. 直头外模或未注塑连接器：按画布拓扑位置判定
  const connectedMaterials = config.materials.filter((material) => material.circuits.some((circuit) =>
    circuit.start?.connectorId === connector.id || circuit.end?.connectorId === connector.id,
  ));
  const relevantMaterials = connectedMaterials.length > 0
    ? connectedMaterials
    : [getNearestMaterialByY(connector.position.y, config.materials)].filter((item): item is CanvasWireMaterial => Boolean(item));
  if (relevantMaterials.length === 0) return 'left';

  const connectorCenterX = connector.position.x + getConnectorNodeWidth(connector) / 2;
  const materialCenterX = relevantMaterials.reduce((sum, material) => sum + getMaterialCenterX(material), 0) / relevantMaterials.length;

  const connectorCenterY = connector.position.y;
  const materialCenterY = relevantMaterials.reduce((sum, material) => sum + material.position.y, 0) / relevantMaterials.length;

  const minMaterialX = Math.min(...relevantMaterials.map((m) => m.position.x));
  const maxMaterialX = Math.max(...relevantMaterials.map((m) => m.position.x + m.width));
  if (connectorCenterY > materialCenterY + 100 && connectorCenterX >= minMaterialX - 50 && connectorCenterX <= maxMaterialX + 50) {
    return 'bottom';
  }

  return connectorCenterX > materialCenterX ? 'right' : 'left';
}

export function getConnectorRotationByOrientation(orientation: ConnectorOrientation): 0 | 180 | -90 {
  switch (orientation) {
    case 'right':
      return 180;
    case 'bottom':
      return -90;
    case 'left':
    default:
      return 0;
  }
}

function connectorImages(connector: ConnectorInstance, config: HarnessConfig): TwoDImage[] {
  const snapshot = getCatalogSnapshot();
  const catalogConnector = snapshot?.connectors.find((item) => item.resourceItemId === connector.connector.resourceItemId);
  const variants = catalogConnector?.imageVariants;
  if (!variants) {
    return [];
  }

  const previousImages = new Map(
    (config.twoDImages ?? [])
      .filter((image) => image.elementKind === 'connector' && image.elementId === connector.id)
      .map((image) => [image.imageRole ?? 'primary', image]),
  );

  const orientation = getConnectorOrientation(connector, config);
  const rotation = getConnectorRotationByOrientation(orientation);

  // 连接器只按 imageVariants 独立生成 before / after / pinMap，绝无任何单图或跨图回退
  const isConnected = isConnectorConnectedToModel(connector, config);
  const bodyRole: 'connector-after' | 'connector-before' = isConnected ? 'connector-after' : 'connector-before';
  const bodyPath = isConnected ? variants.after : variants.before;

  let bodyImage: TwoDImage | undefined;
  if (bodyPath) {
    const previousBody = previousImages.get(bodyRole)
      ?? previousImages.get(bodyRole === 'connector-after' ? 'connector-before' : 'connector-after');
    bodyImage = resourceImage(
      connector.connector.name,
      bodyPath,
      'connector',
      connector.id,
      previousBody,
      bodyRole,
      rotation,
      orientation,
    );
  }

  let pinMapImage: TwoDImage | undefined;
  if (variants.pinMap) {
    pinMapImage = resourceImage(
      '连接器pin位图',
      variants.pinMap,
      'connector',
      connector.id,
      previousImages.get('connector-pin-map'),
      'connector-pin-map',
      0,
      orientation,
    );
  }

  if (bodyImage && pinMapImage) {
    return orientation === 'right' ? [bodyImage, pinMapImage] : [pinMapImage, bodyImage];
  }
  if (bodyImage) {
    return [bodyImage];
  }
  if (pinMapImage) {
    return [pinMapImage];
  }
  return [];
}

function catalogWireImage(material: CanvasWireMaterial): string | undefined {
  const snapshot = getCatalogSnapshot();
  return snapshot?.wires.find((item) => item.resourceItemId === material.resourceItemId)?.image
    ?? material.resourceImageUrl;
}

function catalogOvermoldImage(model: CanvasModel): string | undefined {
  const snapshot = getCatalogSnapshot();
  return snapshot?.overmolds.find((item) => item.resourceItemId === model.resourceItemId)?.image
    ?? model.resourceImageUrl;
}

/** Retained for existing validation/tests; image choice itself is catalog-driven. */
export function isProductImageEligibleJacketedWire(spec: JacketedWireSpec): boolean {
  return spec.coreCount === 4 && spec.jacketMaterial === 'PVC';
}

export function autoAssociateTwoDImages(config: HarnessConfig): TwoDImage[] {
  const previousByElement = new Map(
    (config.twoDImages ?? [])
      .filter((image) => image.elementKind && image.elementId)
      .map((image) => [`${image.elementKind}:${image.elementId}`, image]),
  );
  const previous = (kind: TwoDImage['elementKind'], id: string) => previousByElement.get(`${kind}:${id}`);

  return [
    ...config.connectors.flatMap((connector) => connectorImages(connector, config)),
    ...config.materials.flatMap((material) => {
      const image = catalogWireImage(material);
      return image ? [resourceImage(material.name, image, 'material', material.id, previous('material', material.id))] : [];
    }),
    ...config.models.flatMap((model) => {
      const image = catalogOvermoldImage(model);
      const linkedConnector = config.connectors.find((c) => findLinkedModelForConnector(c, config)?.id === model.id);
      const orientation = linkedConnector ? getConnectorOrientation(linkedConnector, config) : undefined;
      return image ? [resourceImage('Overmold', image, 'model', model.id, previous('model', model.id), 'primary', 0, orientation)] : [];
    }),
  ];
}

export function syncTwoDImages(config: HarnessConfig): TwoDImage[] {
  return autoAssociateTwoDImages(config);
}
