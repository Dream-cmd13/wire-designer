/**
 * Auto-associate 2D images to design elements based on their type and parameters.
 */

import type {
  CanvasModel,
  CanvasWireMaterial,
  ConnectorInstance,
  HarnessConfig,
  JacketedWireSpec,
  TwoDImage,
} from '@/types/harness';
import { imageAssets } from '@/lib/imageAssets';
import { generateId } from '@/lib/commands';
import { getConnectorNodeWidth, getMoldLinkage } from '@/lib/canvasMaterials';

function assetImageByName(name: string): TwoDImage | null {
  const asset = imageAssets.find((a) => a.name === name);
  if (!asset) {
    console.warn(`[autoAssociate] Image asset not found: "${name}". Available:`, imageAssets.map(a => a.name));
    return null;
  }
  console.log(`[autoAssociate] Found image: "${name}" -> ${asset.url}`);
  return {
    id: generateId(),
    name: asset.name,
    dataUrl: asset.url, // Vite 已经处理为 URL
    source: 'asset',
    assetPath: asset.id,
  };
}

function withFlipX(image: TwoDImage | null, flipX: boolean): TwoDImage | null {
  if (!image) return null;
  return flipX ? { ...image, flipX: true } : image;
}

function getMaterialCenterX(material: CanvasWireMaterial): number {
  return material.position.x + material.width / 2;
}

function getNearestMaterialByY(
  y: number,
  materials: CanvasWireMaterial[],
): CanvasWireMaterial | null {
  if (materials.length === 0) return null;
  return [...materials].sort(
    (a, b) => Math.abs(a.position.y - y) - Math.abs(b.position.y - y),
  )[0];
}

function isRightOfMaterials(
  elementCenterX: number,
  materials: CanvasWireMaterial[],
): boolean {
  if (materials.length === 0) return false;
  const averageMaterialCenterX =
    materials.reduce((sum, material) => sum + getMaterialCenterX(material), 0) / materials.length;
  return elementCenterX > averageMaterialCenterX;
}

function getConnectorMaterials(
  connector: ConnectorInstance,
  materials: CanvasWireMaterial[],
): CanvasWireMaterial[] {
  return materials.filter((material) =>
    material.circuits.some((circuit) =>
      circuit.start?.connectorId === connector.id || circuit.end?.connectorId === connector.id,
    ),
  );
}

function shouldFlipConnectorImage(
  connector: ConnectorInstance,
  materials: CanvasWireMaterial[],
): boolean {
  const connectorCenterX = connector.position.x + getConnectorNodeWidth(connector) / 2;
  const connectedMaterials = getConnectorMaterials(connector, materials);
  const relevantMaterials =
    connectedMaterials.length > 0
      ? connectedMaterials
      : [getNearestMaterialByY(connector.position.y, materials)].filter(
          (item): item is CanvasWireMaterial => Boolean(item),
        );
  return isRightOfMaterials(connectorCenterX, relevantMaterials);
}

function shouldFlipModelImage(model: CanvasModel, config: HarnessConfig): boolean {
  const modelCenterX = model.position.x + model.width / 2;
  const linkage = getMoldLinkage(model, config);
  const relevantMaterials =
    linkage?.materials && linkage.materials.length > 0
      ? linkage.materials
      : [getNearestMaterialByY(model.position.y, config.materials)].filter(
          (item): item is CanvasWireMaterial => Boolean(item),
        );
  return isRightOfMaterials(modelCenterX, relevantMaterials);
}

/**
 * Check if a connector is connected to any overmold model.
 * Uses connector-edge-based proximity rather than position-to-position distance.
 */
function isConnectorConnectedToModel(
  connector: ConnectorInstance,
  models: CanvasModel[],
): boolean {
  const connectorLeft = connector.position.x;
  const connectorRight = connector.position.x + getConnectorNodeWidth(connector);
  return models.some((model) => {
    const modelLeft = model.position.x;
    const modelRight = model.position.x + model.width;
    const horizontallyClose = modelLeft < connectorRight + 120 && modelRight > connectorLeft - 120;
    const dy = Math.abs(model.position.y - connector.position.y);
    return horizontallyClose && dy < 200;
  });
}

/**
 * Get the appropriate 2D image for a connector based on whether it's connected to an overmold.
 */
function getConnectorImages(
  connector: ConnectorInstance,
  config: HarnessConfig,
): TwoDImage[] {
  // M12 connector logic
  if (connector.connector.id === 'm12a04-07-093') {
    const isConnected = isConnectorConnectedToModel(connector, config.models);
    const imageName = isConnected ? '连接器注塑后' : '连接器注塑前';
    const flipX = shouldFlipConnectorImage(connector, config.materials);
    const pinMapImage = assetImageByName('连接器pin位图');
    const connectorImage = withFlipX(assetImageByName(imageName), flipX);
    const images = flipX
      ? [connectorImage, pinMapImage]
      : [pinMapImage, connectorImage];
    return images.filter((image): image is TwoDImage => Boolean(image));
  }

  // Add more connector matching rules here
  return [];
}

/**
 * Get the appropriate 2D image for a wire material based on its specifications.
 */
export function isProductImageEligibleJacketedWire(spec: JacketedWireSpec): boolean {
  return spec.coreCount === 4 && spec.jacketMaterial === 'PVC';
}

function getMaterialImage(material: CanvasWireMaterial): TwoDImage | null {
  if (material.spec.kind === 'jacketed') {
    const spec = material.spec;
    // Match: 4芯、PVC、黑色、22AWG、无屏蔽
    if (isProductImageEligibleJacketedWire(spec)) {
      return assetImageByName('护套线');
    }
  }

  // Add more material matching rules here
  return null;
}

/**
 * Get the appropriate 2D image for an overmold model.
 */
function getModelImage(model: CanvasModel, config: HarnessConfig): TwoDImage | null {
  // All overmold models use the same image for now
  if (model.kind === 'outer-box') {
    return withFlipX(assetImageByName('外模'), shouldFlipModelImage(model, config));
  }

  return null;
}

/**
 * Automatically associate 2D images to all elements in the configuration.
 * This function updates the twoDImages array with auto-matched images.
 */
export function autoAssociateTwoDImages(config: HarnessConfig): TwoDImage[] {
  console.log('[autoAssociate] Starting auto-association...');
  console.log('[autoAssociate] Available image assets:', imageAssets.length);
  const images: TwoDImage[] = [];

  // Associate connector images
  for (const connector of config.connectors) {
    console.log(`[autoAssociate] Processing connector: ${connector.connector.id}`);
    const connectorImages = getConnectorImages(connector, config);
    if (connectorImages.length > 0) {
      for (const image of connectorImages) {
        console.log(`[autoAssociate] ✅ Connector image associated:`, image.name);
        images.push({
          ...image,
          elementKind: 'connector',
          elementId: connector.id,
        });
      }
    } else {
      console.log(`[autoAssociate] ⚠️ No image match for connector: ${connector.connector.id}`);
    }
  }

  // Associate material images
  for (const material of config.materials) {
    console.log(`[autoAssociate] Processing material: ${material.name}`);
    const image = getMaterialImage(material);
    if (image) {
      console.log(`[autoAssociate] ✅ Material image associated:`, image.name);
      images.push({
        ...image,
        elementKind: 'material',
        elementId: material.id,
      });
    } else {
      console.log(`[autoAssociate] ⚠️ No image match for material: ${material.name}`);
    }
  }

  // Associate model images
  for (const model of config.models) {
    console.log(`[autoAssociate] Processing model: ${model.kind}`);
    const image = getModelImage(model, config);
    if (image) {
      console.log(`[autoAssociate] ✅ Model image associated:`, image.name);
      images.push({
        ...image,
        elementKind: 'model',
        elementId: model.id,
      });
    } else {
      console.log(`[autoAssociate] ⚠️ No image match for model: ${model.kind}`);
    }
  }

  console.log(`[autoAssociate] Total images associated: ${images.length}`);
  return images;
}

/**
 * Sync 2D images: preserve manually uploaded images and update auto-associated ones.
 */
export function syncTwoDImages(config: HarnessConfig): TwoDImage[] {
  const existing = config.twoDImages ?? [];

  // Keep manually uploaded images (source === 'upload')
  const manualImages = existing.filter((img) => img.source === 'upload');

  // Get fresh auto-associated images
  const autoImages = autoAssociateTwoDImages(config);

  // Merge: manual images + auto images (auto images replace old auto images)
  return [...manualImages, ...autoImages];
}
