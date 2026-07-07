import type { TwoDImage } from '@/types/harness';

interface TwoDImageCardProps {
  image: TwoDImage;
  highlighted?: boolean;
  selected?: boolean;
  onClick: () => void;
}

export function TwoDImageCard({ image, highlighted, selected, onClick }: TwoDImageCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full overflow-hidden rounded-lg border-2 bg-slate-100 transition-all focus:outline-none ${
        highlighted
          ? 'border-blue-500 ring-2 ring-blue-400 ring-offset-1'
          : selected
          ? 'border-slate-400'
          : 'border-transparent hover:border-slate-300'
      }`}
    >
      <img
        src={image.dataUrl}
        alt={image.name}
        className="h-full w-full object-contain"
        draggable={false}
      />
    </button>
  );
}
