import { Link2Off, Trash2 } from 'lucide-react';
import type { TwoDImage } from '@/types/harness';

interface TwoDImageCardProps {
  image: TwoDImage;
  elementLabel?: string;
  highlighted?: boolean;
  onRemoveAssociation: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TwoDImageCard({
  image,
  elementLabel,
  highlighted,
  onRemoveAssociation,
  onDelete,
}: TwoDImageCardProps) {
  return (
    <div
      className={`group relative flex flex-col rounded-lg border bg-white shadow-sm transition-all ${
        highlighted
          ? 'border-blue-500 ring-2 ring-blue-400 ring-offset-1'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      {/* thumbnail */}
      <div className="relative overflow-hidden rounded-t-lg bg-slate-100" style={{ height: 140 }}>
        <img
          src={image.dataUrl}
          alt={image.name}
          className="h-full w-full object-contain"
          draggable={false}
        />
        {highlighted && (
          <div className="absolute inset-0 flex items-start justify-end p-1.5">
            <span className="rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
              已选中
            </span>
          </div>
        )}
      </div>

      {/* info */}
      <div className="flex flex-col gap-1 px-2.5 py-2">
        <p
          className="truncate text-xs font-medium text-slate-800"
          title={image.name}
        >
          {image.name}
        </p>
        {image.elementKind && image.elementId ? (
          <span className="inline-block max-w-full truncate rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
            {elementLabel ?? `${image.elementKind}:${image.elementId}`}
          </span>
        ) : (
          <span className="text-[10px] text-slate-400">未关联</span>
        )}
      </div>

      {/* action buttons, visible on hover */}
      <div className="absolute right-1.5 bottom-1.5 hidden flex-col gap-1 group-hover:flex">
        {image.elementKind && (
          <button
            type="button"
            title="解除关联"
            onClick={() => onRemoveAssociation(image.id)}
            className="flex h-6 w-6 items-center justify-center rounded bg-white shadow hover:bg-amber-50 hover:text-amber-600"
          >
            <Link2Off className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          title="删除图片"
          onClick={() => onDelete(image.id)}
          className="flex h-6 w-6 items-center justify-center rounded bg-white shadow hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
