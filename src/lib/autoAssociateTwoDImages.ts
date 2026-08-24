/**
 * Adds each selected resource item's primary image to the product-image view.
 * Image choice comes from the catalog item's `image_path`, not from the canvas
 * position or a hard-coded local filename.
 */
import type { CanvasModel, CanvasWireMaterial, ConnectorInstance, HarnessConfig, JacketedWireSpec, TwoDImage } from '@/types/harness';
import { generateId } from '@/lib/commands';
import { getCatalogSnapshot } from '@/lib/catalogRuntime';

function resourceImage(
  name: string,
  dataUrl: string,
  elementKind: TwoDImage['elementKind'],
  elementId: string,
  previous: TwoDImage | undefined,
): TwoDImage {
  return {
    id: previous?.id ?? generateId(),
    name,
    dataUrl,
    source: 'catalog',
    elementKind,
    elementId,
    ...(previous?.rotation === undefined ? {} : { rotation: previous.rotation }),
    ...(previous?.flipX === undefined ? {} : { flipX: previous.flipX }),
    ...(previous?.pos === undefined ? {} : { pos: previous.pos }),
  };
}

function catalogConnectorImage(connector: ConnectorInstance): string | undefined {
  const snapshot = getCatalogSnapshot();
  return snapshot?.connectors.find((item) => item.resourceItemId === connector.connector.resourceItemId)?.image
    ?? connector.connector.image;
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
    ...config.connectors.flatMap((connector) => {
      const image = catalogConnectorImage(connector);
      return image ? [resourceImage(connector.connector.name, image, 'connector', connector.id, previous('connector', connector.id))] : [];
    }),
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
