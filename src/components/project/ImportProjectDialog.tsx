import { useRef, useState } from 'react';
import { FileJson, Upload, X } from 'lucide-react';
import { parseDesignFile, type DesignFilePreview } from '@/lib/designFile';
import { getUserErrorMessage } from '@/lib/userErrorMessage';

interface ImportProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (preview: DesignFilePreview) => Promise<void>;
}

export function ImportProjectDialog({ isOpen, onClose, onImport }: ImportProjectDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<DesignFilePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  if (!isOpen) return null;

  const reset = () => {
    setPreview(null);
    setError(null);
    setIssues([]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const close = () => {
    reset();
    onClose();
  };

  const readFile = async (file: File) => {
    setError(null);
    setIssues([]);
    try {
      const parsedJson = JSON.parse(await file.text()) as unknown;
      const result = parseDesignFile(parsedJson);
      if (!result.success) {
        setPreview(null);
        setError(result.message);
        setIssues(result.issues ?? []);
        return;
      }
      setPreview(result.preview);
    } catch {
      setPreview(null);
      setError('无法解析文件：请选择有效的 JSON 设计文件。');
    }
  };

  const confirmImport = async () => {
    if (!preview || importing) return;
    setImporting(true);
    try {
      await onImport(preview);
      close();
    } catch (importError) {
      console.error('项目导入失败:', importError);
      setError(getUserErrorMessage(importError, '导入失败，请重试。'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">导入设计文件</h2>
            <p className="mt-0.5 text-xs text-slate-500">校验通过后创建新项目，不会覆盖现有项目</p>
          </div>
          <button type="button" onClick={close} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-slate-300 px-5 py-7 text-slate-500 transition hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-600"
          >
            <Upload className="mb-2 h-7 w-7" />
            <span className="text-sm font-medium">选择 JSON 设计文件</span>
          </button>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p className="font-medium">{error}</p>
              {issues.length > 0 && (
                <ul className="mt-2 max-h-32 list-disc overflow-y-auto pl-5 text-xs">
                  {issues.slice(0, 12).map((issue) => <li key={issue}>{issue}</li>)}
                </ul>
              )}
            </div>
          )}

          {preview && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="mb-3 flex items-center gap-2 font-medium text-blue-900">
                <FileJson className="h-5 w-5" />
                导入摘要
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-slate-500">项目名称</dt><dd className="text-right font-medium">{preview.name}</dd>
                <dt className="text-slate-500">连接器</dt><dd className="text-right">{preview.config.connectors.length}</dd>
                <dt className="text-slate-500">线材</dt><dd className="text-right">{preview.config.materials.length}</dd>
                <dt className="text-slate-500">保护套 / 外模</dt>
                <dd className="text-right">{preview.config.protectiveSleeves.length} / {preview.config.models.length}</dd>
                <dt className="text-slate-500">业务校验</dt>
                <dd className="text-right">
                  <span className={preview.errorCount > 0 ? 'text-red-600' : 'text-green-600'}>
                    {preview.errorCount} 错误
                  </span>
                  {' · '}{preview.warningCount} 警告
                </dd>
              </dl>
              {preview.errorCount > 0 && (
                <p className="mt-3 text-xs text-amber-700">
                  结构有效，但仍有业务规则错误；可导入后修复，正式输出应继续受校验门禁限制。
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button type="button" onClick={close} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-200">
            取消
          </button>
          <button
            type="button"
            onClick={() => void confirmImport()}
            disabled={!preview || importing}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {importing ? '正在导入...' : '创建新项目'}
          </button>
        </div>
      </div>
    </div>
  );
}
