import { useEffect, useRef, useRef as useCallbackRef } from 'react';
import { Upload } from 'lucide-react';
import { generateId } from '@/lib/commands';
import { useHarnessStore } from '@/stores/harnessStore';
import type { TwoDImage } from '@/types/harness';
import { TwoDImageCard } from './TwoDImageCard';

/** Build a human-readable label for an associated element */
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
    return c ? `连接器·${c.label || c.id}` : `连接器·${elementId}`;
  }
  if (elementKind === 'material') {
    const m = materials.find((x) => x.id === elementId);
    return m ? `线材·${m.name}` : `线材·${elementId}`;
  }
  if (elementKind === 'sleeve') {
    const s = sleeves.find((x) => x.id === elementId);
    return s ? `保护套·${s.id}` : `保护套·${elementId}`;
  }
  if (elementKind === 'model') {
    const mo = models.find((x) => x.id === elementId);
    return mo ? `外模·${mo.id}` : `外模·${elementId}`;
  }
  return elementId;
}

function ImageCardWrapper({
  image,
  highlighted,
  cardRef,
}: {
  image: TwoDImage;
  highlighted: boolean;
  cardRef?: React.RefObject<HTMLDivElement>;
}) {
  const removeTwoDImageAssociation = useHarnessStore((s) => s.clearTwoDImageAssociation);
  const removeTwoDImage = useHarnessStore((s) => s.removeTwoDImage);
  const label = useElementLabel(image.elementKind, image.elementId);

  return (
    <div ref={cardRef}>
      <TwoDImageCard
        image={image}
        elementLabel={label}
        highlighted={highlighted}
        onRemoveAssociation={removeTwoDImageAssociation}
        onDelete={removeTwoDImage}
      />
    </div>
  );
}

export function TwoDView() {
  const twoDImages = useHarnessStore((s) => s.config.twoDImages ?? []);
  const selection = useHarnessStore((s) => s.selection);
  const addTwoDImage = useHarnessStore((s) => s.addTwoDImage);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Map: imageId → ref for auto-scroll
  const cardRefs = useRef<Map<string, React.RefObject<HTMLDivElement>>>(new Map());

  // Find the highlighted image
  const highlightedImageId =
    selection.kind !== 'none'
      ? (twoDImages.find(
          (img) =>
            img.elementKind === selection.kind &&
            img.elementId === (selection as { id: string }).id,
        )?.id ?? null)
      : null;

  // Auto-scroll to highlighted card
  useEffect(() => {
    if (!highlightedImageId) return;
    const ref = cardRefs.current.get(highlightedImageId);
    ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [highlightedImageId]);

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      addTwoDImage({
        id: generateId(),
        name: file.name.replace(/\.[^.]+$/, ''),
        dataUrl,
        source: 'upload',
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  // Ensure each image has a ref
  twoDImages.forEach((img) => {
    if (!cardRefs.current.has(img.id)) {
      cardRefs.current.set(img.id, { current: null } as React.RefObject<HTMLDivElement>);
    }
  });
  // Clean up stale refs
  const imageIds = new Set(twoDImages.map((img) => img.id));
  for (const key of cardRefs.current.keys()) {
    if (!imageIds.has(key)) cardRefs.current.delete(key);
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* toolbar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
        <span className="text-sm font-semibold text-slate-700">2D 图</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {twoDImages.length > 0 && `${twoDImages.length} 张图片`}
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
          />
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

      {/* content */}
      <div className="flex-1 overflow-y-auto p-4">
        {twoDImages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-xl bg-slate-100 p-6">
              <svg
                className="mx-auto h-10 w-10 text-slate-300"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 21h18M4.5 7.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-500">暂无 2D 图片</p>
            <p className="text-xs text-slate-400">
              点击「添加图片」上传，或在设计图中右键元素选择「关联 2D 图」
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 xl:grid-cols-4">
            {twoDImages.map((img) => {
              const ref = cardRefs.current.get(img.id)!;
              return (
                <ImageCardWrapper
                  key={img.id}
                  image={img}
                  highlighted={img.id === highlightedImageId}
                  cardRef={ref}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* hint bar when an element is selected */}
      {selection.kind !== 'none' && highlightedImageId === null && (
        <div className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-700">
          当前选中的元素尚未关联任何 2D 图片。在设计图中右键该元素可进行关联。
        </div>
      )}
    </div>
  );
}
