import type {
  CanvasModel,
  CanvasWireMaterial,
  ConnectorInstance,
  HarnessConfig,
  ProtectiveSleeve,
  TwoDImage,
} from '@/types/harness';
import { getMoldLinkage } from '@/lib/canvasMaterials';
import { getElementX } from '@/lib/twoDImageGroups';

export interface ImageDimensions {
  w: number;
  h: number;
}

export interface AssemblyUnscaledBounds {
  totalWidth: number;
  maxHeight: number;
  leftWidth: number;
  wireWidth: number;
  rightWidth: number;
}

/**
 * Default fallback natural dimensions (in raw pixels) when image is not yet loaded.
 * Derived from the standard catalog asset dimensions.
 */
export const DEFAULT_NATURAL_SIZES: Record<string, ImageDimensions> = {
  material: { w: 529, h: 33 },
  model: { w: 163, h: 86 },
  'connector-pin-map': { w: 85, h: 85 },
  'connector-before': { w: 90, h: 50 },
  'connector-after': { w: 50, h: 50 },
  connector: { w: 60, h: 50 },
  sleeve: { w: 120, h: 30 },
  default: { w: 80, h: 60 },
};

/**
 * Get natural (unscaled raw) pixel dimensions for an image, using cache or fallback.
 */
export function getNaturalDimensions(
  image: TwoDImage,
  naturalSizes?: Record<string, ImageDimensions>,
): ImageDimensions {
  if (naturalSizes && naturalSizes[image.id]) {
    const size = naturalSizes[image.id];
    if (size.w > 0 && size.h > 0) return size;
  }

  if (image.imageRole && DEFAULT_NATURAL_SIZES[image.imageRole]) {
    return DEFAULT_NATURAL_SIZES[image.imageRole];
  }
  if (image.elementKind && DEFAULT_NATURAL_SIZES[image.elementKind]) {
    return DEFAULT_NATURAL_SIZES[image.elementKind];
  }
  return DEFAULT_NATURAL_SIZES.default;
}

/**
 * Check if the image rotation is orthogonal (90° / -90° / 270°), where visual width/height swap.
 */
export function isOrthogonalRotation(rotation?: number): boolean {
  return rotation === 90 || rotation === -90 || rotation === 270;
}

/**
 * Get the visual unscaled dimensions (w0, h0) at scale = 1.0, accounting for rotation.
 */
export function getVisualUnscaledDimensions(
  image: TwoDImage,
  naturalSizes?: Record<string, ImageDimensions>,
): ImageDimensions {
  const raw = getNaturalDimensions(image, naturalSizes);
  if (isOrthogonalRotation(image.rotation)) {
    return { w: raw.h, h: raw.w };
  }
  return { w: raw.w, h: raw.h };
}

/**
 * Calculate the total unscaled bounding size (W0, H0) of an assembly group
 * based on the actual horizontal layout chain and vertical stacking (for bent units).
 */
export function calculateAssemblyUnscaledBounds(
  images: TwoDImage[],
  context: {
    connectors: ConnectorInstance[];
    materials: CanvasWireMaterial[];
    sleeves: ProtectiveSleeve[];
    models: CanvasModel[];
    config: HarnessConfig;
    naturalSizes?: Record<string, ImageDimensions>;
  },
): AssemblyUnscaledBounds {
  const { connectors, materials, sleeves, models, config, naturalSizes } = context;

  const wireImgs = images.filter((img) => img.elementKind === 'material' || img.elementKind === 'sleeve');
  const wireMaterial = wireImgs.find((img) => img.elementKind === 'material');
  const matEntity = wireMaterial ? materials.find((m) => m.id === wireMaterial.elementId) : undefined;
  const matCenterX = matEntity ? matEntity.position.x + matEntity.width / 2 : 0;

  const nonWireImgs = images.filter((img) => img.elementKind !== 'material' && img.elementKind !== 'sleeve');
  const leftImgs: TwoDImage[] = [];
  const rightImgs: TwoDImage[] = [];

  if (wireImgs.length > 0) {
    for (const img of nonWireImgs) {
      const elX = getElementX(img.elementKind, img.elementId, connectors, materials, sleeves, models);
      if (elX < matCenterX) {
        leftImgs.push(img);
      } else {
        rightImgs.push(img);
      }
    }
  } else {
    leftImgs.push(...nonWireImgs);
  }

  const measureEnd = (endImgs: TwoDImage[]) => {
    if (endImgs.length === 0) return { width: 0, height: 0 };

    const connectorIds = Array.from(
      new Set(
        endImgs
          .filter((img) => img.elementKind === 'connector' && img.elementId)
          .map((img) => img.elementId!),
      ),
    );

    const renderedImageIds = new Set<string>();
    let endWidth = 0;
    let endHeight = 0;

    for (const cId of connectorIds) {
      const connImg = endImgs.find(
        (img) => img.elementKind === 'connector' && img.elementId === cId && img.imageRole !== 'connector-pin-map',
      );
      const pinMapImg = endImgs.find(
        (img) => img.elementKind === 'connector' && img.elementId === cId && img.imageRole === 'connector-pin-map',
      );
      const modelImg = endImgs.find((img) => {
        if (img.elementKind !== 'model' || !img.elementId) return false;
        const modelEntity = models.find((m) => m.id === img.elementId);
        if (!modelEntity) return false;
        const linkage = getMoldLinkage(modelEntity, config);
        return linkage?.connector.id === cId;
      });

      if (connImg) renderedImageIds.add(connImg.id);
      if (pinMapImg) renderedImageIds.add(pinMapImg.id);
      if (modelImg) renderedImageIds.add(modelImg.id);

      const isBent = connImg?.orientation === 'bottom' || connImg?.rotation === -90;

      if (pinMapImg) {
        const pinDims = getVisualUnscaledDimensions(pinMapImg, naturalSizes);
        endWidth += pinDims.w + 16; // 16px pin map spacing (mr-4 / ml-4)
        endHeight = Math.max(endHeight, pinDims.h);
      }

      if (isBent) {
        const mDims = modelImg ? getVisualUnscaledDimensions(modelImg, naturalSizes) : { w: 0, h: 0 };
        const cDims = connImg ? getVisualUnscaledDimensions(connImg, naturalSizes) : { w: 0, h: 0 };
        endWidth += Math.max(mDims.w, cDims.w);
        endHeight = Math.max(endHeight, mDims.h + cDims.h);
      } else {
        const physicalItems = [modelImg, connImg].filter((item): item is TwoDImage => Boolean(item));
        for (const item of physicalItems) {
          const dims = getVisualUnscaledDimensions(item, naturalSizes);
          endWidth += dims.w;
          endHeight = Math.max(endHeight, dims.h);
        }
      }
    }

    // Measure any unassigned images in this end
    const unassignedImgs = endImgs.filter((img) => !renderedImageIds.has(img.id));
    for (const item of unassignedImgs) {
      const dims = getVisualUnscaledDimensions(item, naturalSizes);
      endWidth += dims.w;
      endHeight = Math.max(endHeight, dims.h);
    }

    return { width: endWidth, height: endHeight };
  };

  const leftMeasured = measureEnd(leftImgs);
  const rightMeasured = measureEnd(rightImgs);

  // Wire row width and height
  let wireWidth = 0;
  let wireHeight = 0;
  for (const img of wireImgs) {
    const dims = getVisualUnscaledDimensions(img, naturalSizes);
    wireWidth += dims.w;
    wireHeight = Math.max(wireHeight, dims.h);
  }

  const totalWidth = leftMeasured.width + wireWidth + rightMeasured.width;
  const maxHeight = Math.max(leftMeasured.height, wireHeight, rightMeasured.height, 1);

  return {
    totalWidth,
    maxHeight,
    leftWidth: leftMeasured.width,
    wireWidth,
    rightWidth: rightMeasured.width,
  };
}

/**
 * Calculate the uniform scale factor S:
 * S = min(availableWidth / totalWidth, availableHeight / maxHeight, maxScale)
 */
export function calculateUniformAssemblyScale(options: {
  unscaledBounds: AssemblyUnscaledBounds;
  availableWidth: number;
  availableHeight: number;
  maxScale?: number;
}): number {
  const { unscaledBounds, availableWidth, availableHeight, maxScale = 1.0 } = options;

  if (unscaledBounds.totalWidth <= 0 || unscaledBounds.maxHeight <= 0) {
    return 1.0;
  }

  const scaleW = availableWidth / unscaledBounds.totalWidth;
  const scaleH = availableHeight / unscaledBounds.maxHeight;

  const rawScale = Math.min(scaleW, scaleH, maxScale);
  // Keep scale to 3 decimal places, min 0.1
  return Math.max(0.1, parseFloat(rawScale.toFixed(3)));
}

/**
 * Get the scaled display dimensions (visualWidth, visualHeight) for an image.
 */
export function getScaledDisplayDimensions(
  image: TwoDImage,
  scale: number,
  naturalSizes?: Record<string, ImageDimensions>,
): ImageDimensions {
  const unscaled = getVisualUnscaledDimensions(image, naturalSizes);
  return {
    w: Math.max(1, Math.round(unscaled.w * scale)),
    h: Math.max(1, Math.round(unscaled.h * scale)),
  };
}
