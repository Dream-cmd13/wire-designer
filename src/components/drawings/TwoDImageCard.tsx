import React, { useState } from 'react';
import { GripVertical } from 'lucide-react';
import type { TwoDImage } from '@/types/harness';

interface TwoDImageCardProps {
  image: TwoDImage;
  highlighted?: boolean;
  selected?: boolean;
  isDragging?: boolean;
  onClick: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  maxWidth?: number | string;
  maxHeight?: number | string;
  onImageError?: () => void;
}

export function TwoDImageCard({
  image,
  highlighted,
  selected,
  isDragging,
  onClick,
  onMouseDown,
  maxWidth,
  maxHeight,
  onImageError,
}: TwoDImageCardProps) {
  const rotation = image.rotation ?? 0;
  const isOrthogonal = rotation === 90 || rotation === -90 || rotation === 270;
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

  let cardBoxStyle: React.CSSProperties = {};
  let imgStyle: React.CSSProperties = {
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
    transformOrigin: 'center center',
    maxWidth: maxWidth ?? '100%',
    maxHeight: maxHeight ?? 'auto',
    width: 'auto',
    height: 'auto',
    objectFit: 'contain',
    display: 'block',
  };

  if (isOrthogonal && naturalSize && naturalSize.w > 0 && naturalSize.h > 0) {
    const maxW = typeof maxWidth === 'number' ? maxWidth : 160;
    const maxH = typeof maxHeight === 'number' ? maxHeight : 120;

    const scale = Math.min(maxW / naturalSize.h, maxH / naturalSize.w, 1);
    const unrotatedW = Math.round(naturalSize.w * scale);
    const unrotatedH = Math.round(naturalSize.h * scale);
    const visualW = unrotatedH;
    const visualH = unrotatedW;

    cardBoxStyle = {
      width: `${visualW}px`,
      height: `${visualH}px`,
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    };

    imgStyle = {
      width: `${unrotatedW}px`,
      height: `${unrotatedH}px`,
      maxWidth: 'none',
      maxHeight: 'none',
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
      transformOrigin: 'center center',
      objectFit: 'contain',
      display: 'block',
    };
  }

  return (
    <div
      onMouseDown={onMouseDown}
      className="group relative cursor-grab select-none active:cursor-grabbing"
    >
      {/* drag handle badge */}
      <div className="pointer-events-none absolute left-1 top-1 z-10 hidden rounded bg-black/40 p-0.5 backdrop-blur-sm group-hover:block">
        <GripVertical className="h-3 w-3 text-white" />
      </div>

      {/* image - direct display, outline on select/highlight */}
      <button
        type="button"
        onClick={onClick}
        className="block focus:outline-none"
        aria-label={image.name}
        style={cardBoxStyle}
      >
        <img
          src={image.dataUrl}
          alt={image.name}
          draggable={false}
          onLoad={(e) => {
            const imgEl = e.currentTarget;
            if (imgEl.naturalWidth && imgEl.naturalHeight) {
              setNaturalSize({ w: imgEl.naturalWidth, h: imgEl.naturalHeight });
            }
          }}
          onError={onImageError}
          className={`block transition-all ${
            isDragging
              ? 'opacity-80 shadow-2xl ring-4 ring-blue-400'
              : highlighted
              ? 'shadow-lg ring-4 ring-blue-500'
              : selected
              ? 'shadow-md ring-2 ring-slate-400'
              : 'hover:shadow-sm'
          }`}
          style={imgStyle}
        />
      </button>
    </div>
  );
}
