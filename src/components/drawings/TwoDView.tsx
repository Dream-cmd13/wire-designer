import { useEffect, useRef, useState } from 'react';
import { Link2Off, Trash2, Upload } from 'lucide-react';
import { generateId } from '@/lib/commands';
import { useHarnessStore } from '@/stores/harnessStore';
import type { TwoDImage } from '@/types/harness';
import { TwoDImageCard } from './TwoDImageCard';

function useElementLabel(
  elementKind: TwoDImage['elementKind'],
  elementId: string | undefined,
): string {
  const connectors = useHarnessStore((s) => s.config.connectors);
  const materials = useHarnessStore((s) => s.config.materials);
  const sleeves = useHarnessStore((s) => s.config.protectiveSleeves);
  const models = useHarnessStore((s) => s.config.models);

  if (!elementKind || !elementId) return '';
  if (elementKind === 'connector') {
    const c = connectors.find((x) => x.id === elementId);
    return c ? `连接器 · ${c.label || c.id}` : `连接器 · ${elementId}`;
  }
  if (elementKind === 'material') {
    const m = materials.find((x) => x.id === elementId);
    return m ? `线材 · ${m.name}` : `线材 · ${elementId}`;
  }
  if (elementKind === 'sleeve') {
    return `保护套 · ${elementId}`;
  }
  if (elementKind === 'model') {
    return `外模 · ${elementId}`;
  }
  return elementId;
}

function ImageInfoBox({
  image,
  onRemoveAssociation,
  onDelete,
}: {
  image: TwoDImage;
  onRemoveAssociation: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const label = useElementLabel(image.elementKind, image.elementId);

  return (
    <div className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <p className="truncate text-xs font-semibold text-slate-700" title={image.name}>
        {image.name}
      </p>

      <div className="mt-1.5">
        {label ? (
          <span className="inline-block rounded bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
            {label}
          </span>
        ) : (
          <span className="text-[10px] text-slate-400">未关联元素</span>
        )}
      </div>

      <div className="mt-2 flex gap-1.5">
        {image.elementKind && (
          <button
            type="button"
            title="解除关联"
            onClick={() => onRemoveAssociation(image.id)}
            className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
          >
            <Link2Off className="h-3 w-3" />
            解除关联
          </button>
        )}
        <button
          type="button"
          title="删除图片"
          onClick={() => onDelete(image.id)}
          className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-3 w-3" />
          删除
        </button>
      </div>
    </div>
  );
}

export function TwoDView() {
  const twoDImages = useHarnessStore((s) => s.config.twoDImages ?? []);
  const selection = useHarnessStore((s) => s.selection);
  const addTwoDImage = useHarnessStore((s) => s.addTwoDImage);
  const clearTwoDImageAssociation = useHarnessStore((s) => s.clearTwoDImageAssociation);
  const removeTwoDImage = useHarnessStore((s) => s.removeTwoDImage);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const highlightedRef = useRef<HTMLDivElement>(null);

  const highlightedImageId =
    selection.kind !== 'none'
      ? (twoDImages.find(
          (img) =>
            img.elementKind === selection.kind &&
            img.elementId === (selection as { id: string }).id,
        )?.id ?? null)
      : null;

  useEffect(() => {
    if (highlightedImageId) {
      highlightedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [highlightedImageId]);

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      addTwoDImage({
        id: generateId(),
        name: file.name.replace(/\.[^.]+$/, ''),
        dataUrl: ev.target?.result as string,
        source: 'upload',
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
        <span className="text-sm font-semibold text-slate-700">2D 图</span>
        <div className="flex items-center gap-2">
          {twoDImages.length > 0 && (
            <span className="text-xs text-slate-400">{twoDImages.length} 张图片</span>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
          >
            <Upload className="h-3.5 w-3.5" />
            添加图片
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {twoDImages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-xl bg-slate-100 p-6">
              <svg className="mx-auto h-10 w-10 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 21h18M4.5 7.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-500">暂无 2D 图片</p>
            <p className="text-xs text-slate-400">点击「添加图片」上传，或在设计图中右键元素选择「关联 2D 图」</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 xl:grid-cols-4">
            {twoDImages.map((img) => {
              const isHighlighted = img.id === highlightedImageId;
              const isSelected = img.id === selectedId;
              return (
                <div key={img.id} ref={isHighlighted ? highlightedRef : undefined}>
                  <TwoDImageCard
                    image={img}
                    highlighted={isHighlighted}
                    selected={isSelected}
                    onClick={() => setSelectedId((prev) => (prev === img.id ? null : img.id))}
                  />
                  {isSelected && (
                    <ImageInfoBox
                      image={img}
                      onRemoveAssociation={clearTwoDImageAssociation}
                      onDelete={(id) => {
                        removeTwoDImage(id);
                        setSelectedId(null);
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selection.kind !== 'none' && highlightedImageId === null && (
        <div className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-700">
          当前选中的元素尚未关联任何 2D 图片。在设计图中右键该元素可进行关联。
        </div>
      )}
    </div>
  );
}
