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
  const mirror = image.flipX ? 'scaleX(-1)' : '';

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
      >
        <img
          src={image.dataUrl}
          alt={image.name}
          draggable={false}
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
          style={{
            transform: `${mirror} rotate(${rotation}deg)`.trim(),
            transformOrigin: 'center center',
            maxWidth: maxWidth ?? '100%',
            maxHeight: maxHeight ?? 'auto',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            display: 'block',
          }}
        />
      </button>
    </div>
  );
}
