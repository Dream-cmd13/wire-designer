/**
 * Adds each selected resource item's primary image to the product-image view.
 * Image choice comes from the catalog item's `image_path`, not from the canvas
 * position or a hard-coded local filename.
 */
import type { CanvasModel, CanvasWireMaterial, ConnectorInstance, HarnessConfig, JacketedWireSpec, TwoDImage } from '@/types/harness';
import { generateId } from '@/lib/commands';
import { getCatalogSnapshot } from '@/lib/catalogRuntime';
import { getConnectorNodeWidth } from '@/lib/canvasMaterials';

function resourceImage(
  name: string,
  dataUrl: string,
  elementKind: TwoDImage['elementKind'],
  elementId: string,
  previous: TwoDImage | undefined,
  imageRole: TwoDImage['imageRole'] = 'primary',
  flipX?: boolean,
): TwoDImage {
  return {
    id: previous?.id ?? generateId(),
    name,
    dataUrl,
    source: 'catalog',
    imageRole,
    elementKind,
    elementId,
    ...(flipX === undefined
      ? (previous?.flipX === undefined ? {} : { flipX: previous.flipX })
      : (flipX ? { flipX: true } : {})),
    ...(previous?.rotation === undefined ? {} : { rotation: previous.rotation }),
    ...(previous?.pos === undefined ? {} : { pos: previous.pos }),
  };
}

function isConnectorConnectedToModel(connector: ConnectorInstance, models: CanvasModel[]): boolean {
  const connectorLeft = connector.position.x;
  const connectorRight = connector.position.x + getConnectorNodeWidth(connector);
  return models.some((model) => {
    const modelLeft = model.position.x;
    const modelRight = model.position.x + model.width;
    const horizontallyClose = modelLeft < connectorRight + 120 && modelRight > connectorLeft - 120;
    return horizontallyClose && Math.abs(model.position.y - connector.position.y) < 200;
  });
}

function getMaterialCenterX(material: CanvasWireMaterial): number {
  return material.position.x + material.width / 2;
}

function getNearestMaterialByY(y: number, materials: CanvasWireMaterial[]): CanvasWireMaterial | undefined {
  return [...materials].sort((a, b) => Math.abs(a.position.y - y) - Math.abs(b.position.y - y))[0];
}

function shouldFlipConnectorImage(connector: ConnectorInstance, config: HarnessConfig): boolean {
  const connectedMaterials = config.materials.filter((material) => material.circuits.some((circuit) =>
    circuit.start?.connectorId === connector.id || circuit.end?.connectorId === connector.id,
  ));
  const relevantMaterials = connectedMaterials.length > 0
    ? connectedMaterials
    : [getNearestMaterialByY(connector.position.y, config.materials)].filter((item): item is CanvasWireMaterial => Boolean(item));
  if (relevantMaterials.length === 0) return false;
  const connectorCenterX = connector.position.x + getConnectorNodeWidth(connector) / 2;
  const materialCenterX = relevantMaterials.reduce((sum, material) => sum + getMaterialCenterX(material), 0) / relevantMaterials.length;
  return connectorCenterX > materialCenterX;
}

function connectorImages(connector: ConnectorInstance, config: HarnessConfig): TwoDImage[] {
  const snapshot = getCatalogSnapshot();
  const catalogConnector = snapshot?.connectors.find((item) => item.resourceItemId === connector.connector.resourceItemId);
  const variants = catalogConnector?.imageVariants;
  const previousImages = new Map(
    (config.twoDImages ?? [])
      .filter((image) => image.elementKind === 'connector' && image.elementId === connector.id)
      .map((image) => [image.imageRole ?? 'primary', image]),
  );

  if (connector.connector.id !== 'm12a04-07-093' || !variants?.before || !variants.after || !variants.pinMap) {
    const image = catalogConnector?.image ?? connector.connector.image;
    return image ? [resourceImage(connector.connector.name, image, 'connector', connector.id, previousImages.get('primary'))] : [];
  }

  const isRight = shouldFlipConnectorImage(connector, config);
  const bodyRole = isConnectorConnectedToModel(connector, config.models) ? 'connector-after' : 'connector-before';
  const bodyPath = bodyRole === 'connector-after' ? variants.after : variants.before;
  const previousBody = previousImages.get(bodyRole)
    ?? previousImages.get(bodyRole === 'connector-after' ? 'connector-before' : 'connector-after');
  const body = resourceImage(connector.connector.name, bodyPath, 'connector', connector.id, previousBody, bodyRole, isRight);
  const pinMap = resourceImage('连接器pin位图', variants.pinMap, 'connector', connector.id, previousImages.get('connector-pin-map'), 'connector-pin-map');
  return isRight ? [body, pinMap] : [pinMap, body];
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
      return image ? [resourceImage('Overmold', image, 'model', model.id, previous('model', model.id))] : [];
    }),
  ];
}

export function syncTwoDImages(config: HarnessConfig): TwoDImage[] {
  return autoAssociateTwoDImages(config);
}
