import { GripVertical } from 'lucide-react';
import type { TwoDImage } from '@/types/harness';

interface TwoDImageCardProps {
  image: TwoDImage;
  highlighted?: boolean;
  selected?: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  isDragOver?: boolean;
}

export function TwoDImageCard({
  image,
  highlighted,
  selected,
  onClick,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
}: TwoDImageCardProps) {
  const rotation = image.rotation ?? 0;
  // For 90/270 we swap the visual axes inside a square container
  const needsSwap = rotation === 90 || rotation === 270;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`group relative cursor-grab overflow-hidden rounded-lg border-2 bg-slate-100 transition-all active:cursor-grabbing ${
        isDragOver
          ? 'border-blue-400 ring-2 ring-blue-300 ring-offset-1 opacity-70'
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

      {/* image — fills the square; rotation handled inside */}
      <button
        type="button"
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
            maxWidth: needsSwap ? '100%' : '100%',
            maxHeight: needsSwap ? '100%' : '100%',
            width: needsSwap ? 'auto' : '100%',
            height: needsSwap ? '100%' : 'auto',
            objectFit: 'contain',
            transition: 'transform 0.25s ease',
          }}
        />
      </button>
    </div>
  );
}
