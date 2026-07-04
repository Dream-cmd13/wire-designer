import { useEffect, useState } from 'react';
import { Check, Hash, Tag, Trash2, X } from 'lucide-react';

export type MaterialAccessoryKind = 'label' | 'number-tube';

export function MaterialAccessoryDialog({
  kind,
  materialName,
  initialContent = '',
  initialLengthMm,
  initialDistanceMm,
  editing = false,
  onCancel,
  onConfirm,
  onDelete,
}: {
  kind: MaterialAccessoryKind;
  materialName: string;
  initialContent?: string;
  initialLengthMm?: number;
  initialDistanceMm?: number;
  editing?: boolean;
  onCancel: () => void;
  onConfirm: (content: string, lengthMm: number, distanceMm?: number) => void;
  onDelete?: () => void;
}) {
  const isLabel = kind === 'label';
  const [content, setContent] = useState(initialContent);
  const [lengthMm, setLengthMm] = useState(initialLengthMm ?? (isLabel ? 30 : 20));
  const [distanceMm, setDistanceMm] = useState(initialDistanceMm ?? 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const submit = () => {
    if (!content.trim()) {
      setError('内容不能为空');
      return;
    }
    if (!Number.isFinite(lengthMm) || lengthMm <= 0) {
      setError('长度必须大于 0');
      return;
    }
    if (!isLabel && (!Number.isFinite(distanceMm) || distanceMm < 0)) {
      setError('号码管距离不能小于 0');
      return;
    }
    onConfirm(content.trim(), lengthMm, isLabel ? undefined : distanceMm);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className={`rounded-xl p-2 ${isLabel ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600'}`}>
              {isLabel ? <Tag className="h-5 w-5" /> : <Hash className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {editing ? (isLabel ? '编辑标签' : '编辑号码管') : (isLabel ? '添加标签' : '添加号码管')}
              </h2>
              <p className="text-xs text-slate-500">应用到线材：{materialName}</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {isLabel && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">材质</span>
              <input
                readOnly
                value="五防热敏纸标签纸"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
              />
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">内容</span>
            <input
              autoFocus
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                setError(null);
              }}
              placeholder={isLabel ? '例如：主电源线' : '例如：W01'}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">长度 (mm)</span>
            <input
              type="number"
              min="1"
              value={Number.isNaN(lengthMm) ? '' : lengthMm}
              onChange={(event) => {
                setLengthMm(event.target.value === '' ? Number.NaN : Number(event.target.value));
                setError(null);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          {!isLabel && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">距连接器长度 (mm)</span>
              <input
                type="number"
                min="0"
                value={Number.isNaN(distanceMm) ? '' : distanceMm}
                onChange={(event) => {
                  setDistanceMm(event.target.value === '' ? Number.NaN : Number(event.target.value));
                  setError(null);
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <p className="mt-1 text-[11px] text-slate-400">默认 0，表示号码管直接贴着连接器。</p>
            </label>
          )}
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
          <div>
            {editing && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                删除
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-200">
              取消
            </button>
            <button type="button" onClick={submit} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              <Check className="h-4 w-4" />
              确认
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
