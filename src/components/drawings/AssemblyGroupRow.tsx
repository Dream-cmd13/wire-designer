import type React from 'react';
import { getMoldLinkage } from '@/lib/canvasMaterials';
import type { ProductionDrawingLayout } from '@/lib/productionDrawingLayout';
import { getElementX } from '@/lib/twoDImageGroups';
import type {
  CanvasModel,
  CanvasWireMaterial,
  ConnectorInstance,
  HarnessConfig,
  ProtectiveSleeve,
  TwoDImage,
} from '@/types/harness';
import { ProductionWiringDiagram } from './ProductionWiringDiagram';
import { TwoDImageCard } from './TwoDImageCard';
import { WireDimensionAnnotation } from './WireDimensionAnnotation';

interface AssemblyGroupRowProps {
  group: { images: TwoDImage[] };
  groupIdx: number;
  x: number;
  y: number;
  isDraggingThis: boolean;
  showCallouts: boolean;
  productionLayout: ProductionDrawingLayout;
  config: HarnessConfig;
  connectors: ConnectorInstance[];
  materials: CanvasWireMaterial[];
  sleeves: ProtectiveSleeve[];
  models: CanvasModel[];
  exactOffset: number;
  getCardWidth: (img: TwoDImage) => number;
  getCardHeight: (img: TwoDImage) => number;
  onGroupMouseDown: (e: React.MouseEvent, groupIdx: number) => void;
  onImageMouseDown: (e: React.MouseEvent, groupIdx: number) => void;
  onImageError: (imageId: string) => void;
  onNaturalSizeChange: (id: string, url: string, size: { w: number; h: number }) => void;
  onUpdateMaterial: (id: string, updates: Partial<CanvasWireMaterial>) => void;
  setGroupRef: (el: HTMLDivElement | null) => void;
  setTopRowRef: (el: HTMLDivElement | null) => void;
  setWireContainerRef: (el: HTMLDivElement | null) => void;
}

export function AssemblyGroupRow({
  group,
  groupIdx,
  x,
  y,
  isDraggingThis,
  showCallouts,
  productionLayout,
  config,
  connectors,
  materials,
  sleeves,
  models,
  exactOffset,
  getCardWidth,
  getCardHeight,
  onGroupMouseDown,
  onImageMouseDown,
  onImageError,
  onNaturalSizeChange,
  onUpdateMaterial,
  setGroupRef,
  setTopRowRef,
  setWireContainerRef,
}: AssemblyGroupRowProps) {
  const wireImgs = group.images.filter((img) => img.elementKind === 'material' || img.elementKind === 'sleeve');
  const wireMaterial = wireImgs.find((img) => img.elementKind === 'material');
  const matEntity = wireMaterial ? materials.find((m) => m.id === wireMaterial.elementId) : undefined;
  const matCenterX = matEntity ? matEntity.position.x + matEntity.width / 2 : 0;

  const nonWireImgs = group.images.filter((img) => img.elementKind !== 'material' && img.elementKind !== 'sleeve');
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

  const renderCard = (img: TwoDImage) => {
    const cardWidth = getCardWidth(img);
    const cardHeight = getCardHeight(img);
    const wireMat =
      img.elementKind === 'material'
        ? materials.find((m) => m.id === img.elementId)
        : undefined;

    return (
      <div
        key={img.id}
        data-callout-kind={img.elementKind}
        data-callout-id={img.elementId}
        data-callout-role={img.imageRole}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'relative',
        }}
      >
        {wireMat && (
          <WireDimensionAnnotation
            material={wireMat}
            width={cardWidth}
            onUpdate={onUpdateMaterial}
          />
        )}
        <TwoDImageCard
          image={img}
          onMouseDown={(e) => onImageMouseDown(e, groupIdx)}
          onImageError={() => onImageError(img.id)}
          maxWidth={cardWidth}
          maxHeight={cardHeight}
          exactWidth={cardWidth}
          exactHeight={cardHeight}
          onNaturalSizeChange={onNaturalSizeChange}
        />
      </div>
    );
  };

  const renderEnd = (endImgs: TwoDImage[], side: 'left' | 'right') => {
    if (endImgs.length === 0) return null;

    const connectorIds = Array.from(
      new Set(
        endImgs
          .filter((img) => img.elementKind === 'connector' && img.elementId)
          .map((img) => img.elementId!),
      ),
    );

    const renderedImageIds = new Set<string>();

    const connectorUnits = connectorIds.map((cId) => {
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

      return {
        cId,
        connImg,
        pinMapImg,
        modelImg,
        isBent: connImg?.orientation === 'bottom' || connImg?.rotation === -90,
      };
    });

    const unassignedImgs = endImgs.filter((img) => !renderedImageIds.has(img.id));

    return (
      <div key={`end-${side}`} className="flex flex-row items-center gap-0">
        {side === 'left' && unassignedImgs.map(renderCard)}

        {connectorUnits.map((unit) => {
          const physicalItems = side === 'left'
            ? [unit.connImg, unit.modelImg].filter((item): item is TwoDImage => Boolean(item))
            : [unit.modelImg, unit.connImg].filter((item): item is TwoDImage => Boolean(item));

          if (unit.isBent) {
            return (
              <div key={`unit-${unit.cId}`} className="flex flex-row items-center">
                {side === 'left' && unit.pinMapImg && (
                  <div className="mr-4">
                    {renderCard(unit.pinMapImg)}
                  </div>
                )}
                {(unit.modelImg || unit.connImg) && (
                  <div className="flex flex-col items-center gap-0">
                    {unit.modelImg && renderCard(unit.modelImg)}
                    {unit.connImg && renderCard(unit.connImg)}
                  </div>
                )}
                {side === 'right' && unit.pinMapImg && (
                  <div className="ml-4">
                    {renderCard(unit.pinMapImg)}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={`unit-${unit.cId}`} className="flex flex-row items-center">
              {side === 'left' && unit.pinMapImg && (
                <div className="mr-4">
                  {renderCard(unit.pinMapImg)}
                </div>
              )}
              {physicalItems.length > 0 && (
                <div className="flex flex-row items-center gap-0">
                  {physicalItems.map(renderCard)}
                </div>
              )}
              {side === 'right' && unit.pinMapImg && (
                <div className="ml-4">
                  {renderCard(unit.pinMapImg)}
                </div>
              )}
            </div>
          );
        })}

        {side === 'right' && unassignedImgs.map(renderCard)}
      </div>
    );
  };

  const groupMaterials = materials.filter((m) =>
    group.images.some((img) => img.elementKind === 'material' && img.elementId === m.id),
  );
  const groupConnectors = connectors.filter((c) =>
    group.images.some((img) => img.elementKind === 'connector' && img.elementId === c.id),
  );

  return (
    <div
      data-callout-group={groupIdx}
      ref={setGroupRef}
      onMouseDown={(e) => onGroupMouseDown(e, groupIdx)}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        opacity: isDraggingThis ? 0.75 : 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: showCallouts
          ? productionLayout.calloutBand.height + productionLayout.calloutBand.gap
          : productionLayout.assemblyGap,
        border: '1px dashed transparent',
        borderRadius: '8px',
        padding: '4px',
        cursor: isDraggingThis ? 'grabbing' : 'grab',
      }}
      className="group/assembly hover:border-[#e2e8f0] hover:bg-[#f8fafc]/30 transition-colors"
    >
      <div
        ref={setTopRowRef}
        className="relative flex flex-row items-center gap-0"
      >
        {renderEnd(leftImgs, 'left')}
        <div
          ref={setWireContainerRef}
          className="flex flex-row items-center gap-0"
        >
          {wireImgs.map(renderCard)}
        </div>
        {renderEnd(rightImgs, 'right')}
      </div>

      {groupMaterials.length > 0 && (
        <div
          style={{
            transform: exactOffset !== 0 ? `translateX(${exactOffset}px)` : undefined,
          }}
        >
          <ProductionWiringDiagram
            materials={groupMaterials}
            connectors={groupConnectors}
            layout={productionLayout.wiringDiagram}
          />
        </div>
      )}
    </div>
  );
}
