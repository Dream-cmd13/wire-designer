import { GripVertical } from 'lucide-react';
import type { TwoDImage } from '@/types/harness';

interface TwoDImageCardProps {
  image: TwoDImage;
  highlighted?: boolean;
  selected?: boolean;
  isDragging?: boolean;
  onClick: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}

export function TwoDImageCard({
  image,
  highlighted,
  selected,
  isDragging,
  onClick,
  onMouseDown,
}: TwoDImageCardProps) {
  const rotation = image.rotation ?? 0;
  const needsSwap = rotation === 90 || rotation === 270;

  return (
    <div
      onMouseDown={onMouseDown}
      className={`group relative cursor-grab overflow-hidden rounded-lg border-2 bg-slate-100 transition-colors active:cursor-grabbing select-none ${
        isDragging
          ? 'border-blue-400 opacity-80 shadow-xl ring-2 ring-blue-300 ring-offset-1'
          : highlighted
          ? 'border-blue-500 ring-2 ring-blue-400 ring-offset-1'
          : selected
          ? 'border-slate-400'
          : 'border-transparent hover:border-slate-300'
      }`}
      style={{ aspectRatio: '1 / 1' }}
    >
      {/* drag handle badge */}
      <div className="pointer-events-none absolute left-1 top-1 z-10 hidden rounded bg-black/30 p-0.5 group-hover:block">
        <GripVertical className="h-3 w-3 text-white" />
      </div>

      {/* image */}
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onClick}
        className="flex h-full w-full items-center justify-center focus:outline-none"
        aria-label={image.name}
      >
        <img
          src={image.dataUrl}
          alt={image.name}
          draggable={false}
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: 'center center',
            width: needsSwap ? 'auto' : '100%',
            height: needsSwap ? '100%' : 'auto',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            transition: 'transform 0.25s ease',
          }}
        />
      </button>
    </div>
  );
}
