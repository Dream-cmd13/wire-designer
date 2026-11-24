import type { RefObject } from 'react';
import { Box, CloudUpload, Download, Loader2, RefreshCw, Upload } from 'lucide-react';
import { PageHeaderActions } from '@/components/layout/PageHeaderActions';
import type { DwgAsset } from '@/repositories/dwgRepository';
import { toolbarButtonClass, ToolbarError } from './DwgToolbarParts';

export type DwgSaveStatus = 'local' | 'saving' | 'saved' | 'error';

const saveText: Record<DwgSaveStatus, string> = {
  local: '仅本地预览',
  saving: '保存中…',
  saved: '已保存',
  error: '保存失败，可重试',
};

const headerIconButtonClass =
  'flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40';

interface DwgHeaderActionsProps {
  ownerId: string | null;
  fileName: string;
  isReady: boolean;
  isErrorPhase: boolean;
  localFile: File | null;
  saving: boolean;
  saveStatus: DwgSaveStatus;
  editing: boolean;
  showCanvasPicker: boolean;
  repositoryConfigured: boolean;
  cloudId: string;
  cloudDrawings: DwgAsset[];
  selectedCloudDrawing?: DwgAsset;
  cloudPlaceholder: string;
  listLoading: boolean;
  listError: string | null;
  fileError: string | null;
  originalSaveError: string | null;
  recoveryError: string | null;
  exporting: 'pdf' | 'png' | null;
  harnessPreviewButtonRef: RefObject<HTMLButtonElement | null>;
  onSelectCloudAsset: (assetId: string) => void;
  onRefreshList: () => void;
  onRecoverUpload: (asset: DwgAsset) => void;
  onChooseFile: () => void;
  onSaveOriginal: () => void;
  onExport: (format: 'png' | 'pdf') => void;
  onOpenHarnessPreview: () => void;
}

export function DwgHeaderActions({
  ownerId,
  fileName,
  isReady,
  isErrorPhase,
  localFile,
  saving,
  saveStatus,
  editing,
  showCanvasPicker,
  repositoryConfigured,
  cloudId,
  cloudDrawings,
  selectedCloudDrawing,
  cloudPlaceholder,
  listLoading,
  listError,
  fileError,
  originalSaveError,
  recoveryError,
  exporting,
  harnessPreviewButtonRef,
  onSelectCloudAsset,
  onRefreshList,
  onRecoverUpload,
  onChooseFile,
  onSaveOriginal,
  onExport,
  onOpenHarnessPreview,
}: DwgHeaderActionsProps) {
  const saveStatusBadgeClass = saving
    ? 'border-blue-200 bg-blue-50 text-blue-700'
    : saveStatus === 'saved'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : saveStatus === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-slate-200 bg-slate-100 text-slate-600';

  return (
    <PageHeaderActions>
      <div className="flex min-w-0 max-w-full items-center gap-1.5">
        {fileName && (
          <span className="min-w-0 max-w-44 sm:max-w-52 xl:max-w-64 truncate rounded-md border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700" title={fileName}>
            {fileName}
          </span>
        )}
        {(saving || (isReady && (localFile || saveStatus === 'saved'))) && (
          <span className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${saveStatusBadgeClass}`} role="status">
            {saving ? saveText.saving : saveText[saveStatus]}
          </span>
        )}
      </div>

      {ownerId && (
        <div className="flex max-w-full min-w-0 items-center gap-1">
          <select
            className="h-8 w-36 sm:w-52 xl:w-56 min-w-0 cursor-pointer truncate rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
            value={selectedCloudDrawing && (!isErrorPhase || selectedCloudDrawing.status === 'uploading') ? cloudId : ''}
            onChange={(event) => onSelectCloudAsset(event.target.value)}
            disabled={saving || cloudDrawings.length === 0}
            aria-label="云端图纸"
            title={selectedCloudDrawing?.original_name ?? '我的云端图纸'}
          >
            <option value="" disabled>{cloudPlaceholder}</option>
            {cloudDrawings.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.original_name}{asset.parent_asset_id ? '（修订版）' : ''}{asset.status === 'uploading' ? '（保存未完成）' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={headerIconButtonClass}
            aria-label="刷新云端图纸"
            title="刷新云端图纸"
            aria-describedby={listError ? 'dwg-list-error' : undefined}
            disabled={saving || listLoading || !repositoryConfigured}
            onClick={onRefreshList}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${listLoading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
          <ToolbarError id="dwg-list-error" message={listError} />
          {selectedCloudDrawing?.status === 'uploading' && (
            <div className="flex max-w-full min-w-0 items-center gap-1">
              <button
                type="button"
                className={toolbarButtonClass}
                disabled={saving}
                onClick={() => onRecoverUpload(selectedCloudDrawing)}
                aria-describedby={recoveryError ? 'dwg-recovery-error' : undefined}
              >
                <CloudUpload className="h-3.5 w-3.5" />
                恢复保存
              </button>
              <ToolbarError id="dwg-recovery-error" message={recoveryError} />
            </div>
          )}
        </div>
      )}

      {(!showCanvasPicker || fileError) && (
        <div className="flex max-w-full min-w-0 items-center gap-1">
          {!showCanvasPicker && (
            <button
              type="button"
              className={toolbarButtonClass}
              disabled={saving}
              aria-describedby={fileError ? 'dwg-file-error' : undefined}
              onClick={onChooseFile}
            >
              <Upload className="h-3.5 w-3.5" />
              选择文件
            </button>
          )}
          <ToolbarError id="dwg-file-error" message={fileError} />
        </div>
      )}

      {ownerId && !editing && (
        <div className="flex max-w-full min-w-0 items-center gap-1">
          <button
            type="button"
            className="flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-blue-600 bg-blue-600 px-2 text-xs font-medium text-white shadow-2xs transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
            disabled={!localFile || !isReady || saving || saveStatus === 'saved' || !repositoryConfigured}
            aria-describedby={originalSaveError ? 'dwg-save-error' : undefined}
            title={repositoryConfigured ? '保存 DWG 原文件' : '云端尚未配置'}
            onClick={onSaveOriginal}
          >
            <CloudUpload className="h-3.5 w-3.5" />
            {saveStatus === 'error' ? '重试保存' : '保存到云端'}
          </button>
          <ToolbarError id="dwg-save-error" message={originalSaveError} />
        </div>
      )}

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className={toolbarButtonClass}
          onClick={() => onExport('png')}
          disabled={!isReady || exporting !== null}
          aria-label="导出 PNG"
          title="导出 PNG（适应图纸范围，含背景与图层显示）"
        >
          {exporting === 'png' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          PNG
        </button>
        <button
          type="button"
          className={toolbarButtonClass}
          onClick={() => onExport('pdf')}
          disabled={!isReady || exporting !== null}
          aria-label="导出 PDF"
          title="导出 A4 横向 PDF（适应图纸范围，含背景与图层显示）"
        >
          {exporting === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          PDF
        </button>
        <button
          type="button"
          ref={harnessPreviewButtonRef}
          className={toolbarButtonClass}
          disabled={!isReady}
          aria-label="生成 3D 示意"
          onClick={onOpenHarnessPreview}
          title="从 M12 单段线缆图纸生成 3D 示意"
        >
          <Box className="h-3.5 w-3.5" />
          3D 示意
        </button>
      </div>
    </PageHeaderActions>
  );
}
