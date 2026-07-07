import { useEffect, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { generateId } from '@/lib/commands';
import { imageAssets } from '@/lib/imageAssets';
import { useHarnessStore } from '@/stores/harnessStore';
import type { TwoDImage } from '@/types/harness';

export interface AssociateTarget {
  kind: 'connector' | 'material' | 'sleeve' | 'model';
  id: string;
  label: string;
}

interface TwoDAssociateDialogProps {
  target: AssociateTarget;
  onClose: () => void;
}

type Tab = 'library' | 'assets';

export function TwoDAssociateDialog({ target, onClose }: TwoDAssociateDialogProps) {
  const [tab, setTab] = useState<Tab>('library');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const twoDImages = useHarnessStore((s) => s.config.twoDImages ?? []);
  const addTwoDImage = useHarnessStore((s) => s.addTwoDImage);
  const updateTwoDImageAssociation = useHarnessStore((s) => s.updateTwoDImageAssociation);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleConfirm() {
    if (!selectedId) return;
    updateTwoDImageAssociation(selectedId, target.kind, target.id);
    onClose();
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const newImg: TwoDImage = {
        id: generateId(),
        name: file.name.replace(/\.[^.]+$/, ''),
        dataUrl,
        source: 'upload',
      };
      addTwoDImage(newImg);
      setSelectedId(newImg.id);
      setTab('library');
    };
    reader.readAsDataURL(file);
    // reset so same file can be re-selected
    e.target.value = '';
  }

  function handleAddAsset(asset: typeof imageAssets[number]) {
    // Check if this asset is already in the library
    const existing = twoDImages.find((img) => img.assetPath === asset.id);
    if (existing) {
      setSelectedId(existing.id);
      setTab('library');
      return;
    }
    // Fetch and convert to dataUrl for persistence
    fetch(asset.url)
      .then((r) => r.blob())
      .then((blob) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const newImg: TwoDImage = {
            id: generateId(),
            name: asset.name,
            dataUrl: ev.target?.result as string,
            source: 'asset',
            assetPath: asset.id,
          };
          addTwoDImage(newImg);
          setSelectedId(newImg.id);
          setTab('library');
        };
        reader.readAsDataURL(blob);
      });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex w-[480px] max-h-[90vh] flex-col rounded-xl bg-white shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">关联 2D 图片</p>
            <p className="text-xs text-slate-400">目标元素：{target.label}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {/* tabs */}
        <div className="flex gap-2 border-b border-slate-100 px-4 pt-2">
          {(['library', 'assets'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`pb-2 text-xs font-medium transition-colors ${
                tab === t
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'library' ? '图片库' : '根目录图片'}
            </button>
          ))}
        </div>

        {/* content */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'library' && (
            <>
              {twoDImages.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-8">
                  图片库为空，请上传图片或从根目录选择
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {twoDImages.map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setSelectedId(img.id)}
                      className={`relative flex flex-col overflow-hidden rounded-lg border text-left transition-all ${
                        selectedId === img.id
                          ? 'border-blue-500 ring-2 ring-blue-400'
                          : 'border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <img
                        src={img.dataUrl}
                        alt={img.name}
                        className="h-20 w-full object-contain bg-slate-50"
                      />
                      <p className="truncate px-1.5 py-1 text-[10px] text-slate-700">{img.name}</p>
                    </button>
                  ))}
                </div>
              )}

              {/* upload button */}
              <div className="mt-3">
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
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-2.5 text-xs text-slate-500 hover:border-blue-400 hover:text-blue-500"
                >
                  <Upload className="h-3.5 w-3.5" />
                  上传图片
                </button>
              </div>
            </>
          )}

          {tab === 'assets' && (
            <>
              {imageAssets.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-8">
                  根目录下未找到图片文件
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {imageAssets.map((asset) => {
                    const inLib = twoDImages.some((img) => img.assetPath === asset.id);
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => handleAddAsset(asset)}
                        className="relative flex flex-col overflow-hidden rounded-lg border border-slate-200 text-left hover:border-blue-400"
                      >
                        <img
                          src={asset.url}
                          alt={asset.name}
                          className="h-20 w-full object-contain bg-slate-50"
                        />
                        <p className="truncate px-1.5 py-1 text-[10px] text-slate-700">
                          {asset.name}
                        </p>
                        {inLib && (
                          <span className="absolute right-1 top-1 rounded bg-blue-500 px-1 text-[9px] text-white">
                            已添加
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* footer */}
        <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!selectedId}
            onClick={handleConfirm}
            className="rounded-lg bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-40"
          >
            确认关联
          </button>
        </div>
      </div>
    </div>
  );
}
