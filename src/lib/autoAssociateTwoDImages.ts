/**
 * Adds each selected catalog item's primary image to the product-image view.
 * Image choice is made in the catalog (`catalog_item_images.is_primary`), not
 * from the canvas position or a hard-coded local filename.
 */
import type { CanvasModel, CanvasWireMaterial, ConnectorInstance, HarnessConfig, JacketedWireSpec, TwoDImage } from '@/types/harness';
import { generateId } from '@/lib/commands';

function catalogImage(name: string, dataUrl: string, elementKind: TwoDImage['elementKind'], elementId: string): TwoDImage {
  return { id: generateId(), name, dataUrl, source: 'asset', elementKind, elementId };
}

function connectorImages(connector: ConnectorInstance): TwoDImage[] {
  const image = connector.connector.image;
  return image ? [catalogImage(connector.connector.name, image, 'connector', connector.id)] : [];
}

function wireImage(material: CanvasWireMaterial): TwoDImage[] {
  return material.catalogImageUrl ? [catalogImage(material.name, material.catalogImageUrl, 'material', material.id)] : [];
}

function overmoldImage(model: CanvasModel): TwoDImage[] {
  return model.catalogImageUrl ? [catalogImage('Overmold', model.catalogImageUrl, 'model', model.id)] : [];
}

/** Retained for existing validation/tests; image choice itself is catalog-driven. */
export function isProductImageEligibleJacketedWire(spec: JacketedWireSpec): boolean {
  return spec.coreCount === 4 && spec.jacketMaterial === 'PVC';
}

export function autoAssociateTwoDImages(config: HarnessConfig): TwoDImage[] {
  return [
    ...config.connectors.flatMap(connectorImages),
    ...config.materials.flatMap(wireImage),
    ...config.models.flatMap(overmoldImage),
  ];
}

export function syncTwoDImages(config: HarnessConfig): TwoDImage[] {
  const manualImages = (config.twoDImages ?? []).filter((image) => image.source === 'upload');
  return [...manualImages, ...autoAssociateTwoDImages(config)];
}
