import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabaseClient';
import { extractSheetImages, type SheetEmbeddedImage } from '@/lib/excelEmbeddedImages';

const BUCKET_NAME = 'cost-analysis-sources';

function resolveCostAnalysisStoragePath(filePathOrUrl: string): string {
  if (!filePathOrUrl) return '';
  const marker = `/${BUCKET_NAME}/`;
  const idx = filePathOrUrl.indexOf(marker);
  if (idx !== -1) {
    return decodeURIComponent(filePathOrUrl.slice(idx + marker.length).split('?')[0]);
  }
  return filePathOrUrl.replace(/^\/+/, '').split('?')[0];
}

async function fetchProtectedExcelBlob(targetKey: string): Promise<Blob> {
  const storagePath = resolveCostAnalysisStoragePath(targetKey);

  if (supabase) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) {
      throw new Error('请先登录系统以访问私有成本分析表');
    }

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(storagePath);

    if (error || !data) {
      throw new Error(`无法获取 Excel 文件: ${error?.message || '未知错误'}`);
    }

    return data;
  }

  const res = await fetch(targetKey);
  if (!res.ok) {
    throw new Error(`无法获取 Excel 文件 (${res.status} ${res.statusText})`);
  }
  return await res.blob();
}

interface ExcelPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string | null;
  initialSheetName?: string | null;
  fileUrl?: string | null;
  filePath?: string | null;
}

interface CellData {
  address: string;
  r: number;
  c: number;
  value: string;
  formula?: string;
  isNumeric: boolean;
  rowSpan?: number;
  colSpan?: number;
  isHidden?: boolean;
}

export function ExcelPreviewModal({
  isOpen,
  onClose,
  fileName,
  initialSheetName,
  fileUrl,
  filePath,
}: ExcelPreviewModalProps) {
  const currentTargetKey = isOpen && fileName ? (filePath || fileUrl || null) : null;

  const [loadedState, setLoadedState] = useState<{
    targetKey: string;
    workbook: XLSX.WorkBook | null;
    error: string | null;
  } | null>(null);

  const [activeSheet, setActiveSheet] = useState<string>('');
  const [selectedCell, setSelectedCell] = useState<CellData | null>(null);
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [lightboxImage, setLightboxImage] = useState<SheetEmbeddedImage | null>(null);

  // 渲染期派生状态：当当前文件变化时自动派生 loading，无需在 effect 中同步 setState
  const loading = Boolean(currentTargetKey && loadedState?.targetKey !== currentTargetKey);
  const workbook = loadedState?.targetKey === currentTargetKey ? loadedState.workbook : null;
  const error = !currentTargetKey
    ? '未找到该成品方案的云端 Excel 存储地址'
    : loadedState?.targetKey === currentTargetKey
      ? loadedState.error
      : null;

  // 键盘快捷键 (Esc)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxImage) setLightboxImage(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, lightboxImage]);

  // 加载 Excel 文件
  useEffect(() => {
    if (!isOpen || !currentTargetKey) {
      return;
    }

    const downloadPath = currentTargetKey;
    let isCancelled = false;

    fetchProtectedExcelBlob(downloadPath)
      .then(async (blob) => {
        if (isCancelled) return;
        const buffer = await blob.arrayBuffer();
        try {
          const wb = XLSX.read(buffer, { type: 'array', cellFormula: true, cellStyles: true, bookFiles: true });
          setLoadedState({
            targetKey: downloadPath,
            workbook: wb,
            error: null,
          });

          // 选取初始工作表
          if (initialSheetName && wb.SheetNames.includes(initialSheetName)) {
            setActiveSheet(initialSheetName);
          } else if (wb.SheetNames.length > 0) {
            setActiveSheet(wb.SheetNames[0]);
          }
        } catch (parseErr) {
          throw new Error(
            `解析 Excel 内容失败: ${parseErr instanceof Error ? parseErr.message : '未知错误'}`,
            { cause: parseErr },
          );
        }
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error('加载 Excel 预览失败:', err);
        setLoadedState({
          targetKey: downloadPath,
          workbook: null,
          error: err instanceof Error ? err.message : '加载 Excel 失败',
        });
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, currentTargetKey, initialSheetName]);

  // 解析当前 Sheet 的表格网格数据、合并单元格与列宽
  const { grid, maxCol, maxRow, colWidths } = useMemo(() => {
    if (!workbook || !activeSheet || !workbook.Sheets[activeSheet]) {
      return { grid: [], maxCol: 0, maxRow: 0, colWidths: [] };
    }

    const ws = workbook.Sheets[activeSheet];
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
    const rowList: CellData[][] = [];

    // 限制最大渲染行和列，防止异常巨大的工作表卡顿（通常成本分析在 100行*25列以内）
    const endRow = Math.min(range.e.r, 120);
    const endCol = Math.min(range.e.c, 30);

    // 1. 解析合并单元格
    const rawMerges = ws['!merges'] || [];
    const mergeStarts = new Map<string, { rowSpan: number; colSpan: number }>();
    const hiddenCells = new Set<string>();

    for (const m of rawMerges) {
      const startR = m.s.r;
      const startC = m.s.c;
      const eR = Math.min(m.e.r, endRow);
      const eC = Math.min(m.e.c, endCol);

      if (startR > endRow || startC > endCol) continue;

      const rowSpan = eR - startR + 1;
      const colSpan = eC - startC + 1;

      if (rowSpan > 1 || colSpan > 1) {
        mergeStarts.set(`${startR},${startC}`, { rowSpan, colSpan });

        for (let r = startR; r <= eR; r++) {
          for (let c = startC; c <= eC; c++) {
            if (r === startR && c === startC) continue;
            hiddenCells.add(`${r},${c}`);
          }
        }
      }
    }

    // 2. 解析列宽
    const rawCols = ws['!cols'] || [];
    const computedColWidths: number[] = [];
    for (let c = 0; c <= endCol; c++) {
      const col = rawCols[c];
      let w = 85;
      if (col) {
        if (typeof col.wpx === 'number') {
          w = Math.max(50, Math.min(col.wpx, 320));
        } else if (typeof col.wch === 'number') {
          w = Math.max(50, Math.min(Math.round(col.wch * 7.8 + 12), 320));
        }
      }
      computedColWidths.push(w);
    }

    // 3. 构建单元格矩阵
    for (let r = 0; r <= endRow; r++) {
      const colList: CellData[] = [];
      for (let c = 0; c <= endCol; c++) {
        const address = XLSX.utils.encode_cell({ r, c });
        const cell = ws[address];
        let valStr = '';
        let isNum = false;

        if (cell) {
          if (cell.w !== undefined) {
            valStr = String(cell.w);
          } else if (cell.v !== undefined) {
            valStr = String(cell.v);
          }
          isNum = typeof cell.v === 'number';
        }

        const coordKey = `${r},${c}`;
        const isHidden = hiddenCells.has(coordKey);
        const mergeInfo = mergeStarts.get(coordKey);

        colList.push({
          address,
          r,
          c,
          value: valStr,
          formula: cell ? cell.f : undefined,
          isNumeric: isNum,
          rowSpan: mergeInfo?.rowSpan,
          colSpan: mergeInfo?.colSpan,
          isHidden,
        });
      }
      rowList.push(colList);
    }

    return {
      grid: rowList,
      maxCol: endCol,
      maxRow: endRow,
      colWidths: computedColWidths,
    };
  }, [workbook, activeSheet]);

  const sheetImages = useMemo(
    () => (workbook && activeSheet ? extractSheetImages(workbook, activeSheet) : []),
    [workbook, activeSheet],
  );

  if (!isOpen || !fileName) return null;

  const handleDownload = async () => {
    if (!currentTargetKey) return;
    try {
      const blob = await fetchProtectedExcelBlob(currentTargetKey);
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName || '成本分析.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error('下载 Excel 失败:', err);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="excel-preview-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`relative flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl transition-all ${
          isFullScreen ? 'h-full w-full' : 'max-h-[94vh] h-[90vh] w-full max-w-6xl'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 rounded-t-xl shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3
                id="excel-preview-modal-title"
                className="truncate text-sm font-bold text-slate-800"
                title={fileName}
              >
                {fileName}
              </h3>
              <p className="text-[11px] text-slate-400">来源成本分析核算原始表格在线预览</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 搜索框 */}
            <label className="relative hidden sm:block">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="查找单元格内容..."
                className="h-7.5 w-36 sm:w-48 rounded-md border border-slate-200 bg-white pr-2.5 pl-8 text-xs outline-none transition focus:border-emerald-500 focus:w-56"
              />
            </label>

            {/* 下载原件按钮 */}
            {currentTargetKey && (
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-emerald-700 transition"
                title="下载原始 Excel 文件"
              >
                <Download className="h-3.5 w-3.5" />
                <span>下载 Excel</span>
              </button>
            )}

            {/* 全屏切换 */}
            <button
              type="button"
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="cursor-pointer rounded-md p-1.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 transition"
              title={isFullScreen ? '还原窗口' : '全屏显示'}
            >
              {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>

            {/* 关闭 */}
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-md p-1.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 transition"
              title="关闭 (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Sheet 选项卡栏 (类似 Excel 标签) */}
        {workbook && workbook.SheetNames.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-slate-100/80 px-4 py-1.5 shrink-0">
            <span className="text-[11px] font-medium text-slate-400 mr-1.5 shrink-0">工作表:</span>
            {workbook.SheetNames.map((name) => {
              const isActive = name === activeSheet;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setActiveSheet(name);
                    setSelectedCell(null);
                  }}
                  className={`cursor-pointer shrink-0 rounded-md px-3 py-1 text-xs font-medium transition ${
                    isActive
                      ? 'bg-white text-emerald-700 shadow-2xs border-b-2 border-emerald-600 font-semibold'
                      : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        )}

        {/* 公式显示栏 (fx) */}
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-1.5 text-xs shrink-0">
          <div className="flex h-5 w-12 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-50 font-mono font-bold text-slate-700 text-[11px]">
            {selectedCell ? selectedCell.address : '-'}
          </div>
          <div className="text-slate-400 font-serif italic text-xs font-semibold select-none">
            fx
          </div>
          <div className="flex-1 overflow-hidden truncate font-mono text-slate-800 text-[11px] bg-slate-50/60 rounded px-2 py-0.5 border border-slate-100 min-h-[22px] flex items-center">
            {selectedCell ? (
              selectedCell.formula ? (
                <span className="text-emerald-700 font-semibold">={selectedCell.formula}</span>
              ) : (
                <span>{selectedCell.value || '(空)'}</span>
              )
            ) : (
              <span className="text-slate-400">点击任意单元格查看内容及计算公式</span>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-auto bg-slate-50/50 p-2">
          {loading && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
              <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
              <span className="text-xs">正在加载并解析原始 Excel...</span>
            </div>
          )}

          {error && !loading && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="rounded-full bg-red-50 p-3 text-red-600">
                <FileSpreadsheet className="h-8 w-8" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">无法加载 Excel 预览</p>
                <p className="mt-1 text-xs text-red-600 max-w-md">{error}</p>
              </div>
              {currentTargetKey && (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700 transition"
                >
                  <Download className="h-4 w-4" />
                  <span>直接下载原文件</span>
                </button>
              )}
            </div>
          )}

          {!loading && !error && grid.length > 0 && (
            <div className="inline-block min-w-full rounded border border-slate-300 bg-white shadow-xs overflow-hidden">
              <table className="border-collapse text-xs select-text">
                <thead>
                  <tr className="bg-slate-100 text-slate-500 font-mono text-[11px]">
                    <th className="w-10 min-w-10 border border-slate-300 bg-slate-200/80 p-1 text-center font-bold">
                      #
                    </th>
                    {Array.from({ length: maxCol + 1 }).map((_, cIdx) => {
                      const width = colWidths[cIdx] ?? 80;
                      return (
                        <th
                          key={cIdx}
                          style={{ width: `${width}px`, minWidth: `${width}px` }}
                          className="border border-slate-300 px-2 py-1 text-center font-semibold text-slate-600"
                        >
                          {XLSX.utils.encode_col(cIdx)}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {grid.map((row, rIdx) => {
                    const rowNumber = rIdx + 1;
                    return (
                      <tr key={rIdx} className="hover:bg-slate-50/70">
                        {/* 行号 */}
                        <td className="border border-slate-300 bg-slate-100/90 text-center font-mono text-[10px] text-slate-500 font-medium select-none px-1">
                          {rowNumber}
                        </td>
                        {/* 各列单元格 */}
                        {row.map((cell) => {
                          if (cell.isHidden) return null;

                          const isSelected = selectedCell?.address === cell.address;
                          const hasFormula = Boolean(cell.formula);
                          const isMatch =
                            filterQuery.trim() &&
                            cell.value.toLowerCase().includes(filterQuery.trim().toLowerCase());

                          return (
                            <td
                              key={cell.address}
                              rowSpan={cell.rowSpan}
                              colSpan={cell.colSpan}
                              onClick={() => setSelectedCell(cell)}
                              title={
                                hasFormula
                                  ? `坐标: ${cell.address}\n公式: =${cell.formula}\n数值: ${cell.value}`
                                  : `坐标: ${cell.address}\n值: ${cell.value}`
                              }
                              className={`relative border border-slate-200 px-2 py-1 font-mono text-[11px] cursor-pointer transition-colors ${
                                cell.isNumeric ? 'text-right' : 'text-left'
                              } ${
                                isSelected
                                  ? 'bg-emerald-50 ring-2 ring-emerald-500 z-10 font-bold'
                                  : isMatch
                                    ? 'bg-yellow-100 font-semibold'
                                    : 'hover:bg-slate-100/50'
                              }`}
                            >
                              {/* 公式绿色小标记 */}
                              {hasFormula && (
                                <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t-[6px] border-l-[6px] border-t-emerald-500 border-l-transparent" />
                              )}
                              <span className="break-words">{cell.value}</span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && sheetImages.length > 0 && (
            <div className="mt-3 rounded border border-slate-300 bg-white shadow-xs">
              <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                <ImageIcon className="h-3.5 w-3.5 text-emerald-600" />
                <span>本表内嵌图片（{sheetImages.length}）</span>
                <span className="text-[11px] font-normal text-slate-400">点击缩略图可放大查看</span>
              </div>
              <div className="flex flex-wrap gap-3 p-3">
                {sheetImages.map((image) => (
                  <button
                    key={image.mediaPath}
                    type="button"
                    onClick={() => setLightboxImage(image)}
                    className="flex w-[200px] cursor-zoom-in flex-col gap-1.5 rounded-md border border-slate-200 bg-white p-1.5 text-left transition hover:border-emerald-400 hover:shadow-sm"
                    title={`${image.mediaPath}（${(image.bytes / 1024).toFixed(1)} KB）`}
                  >
                    <img
                      src={image.dataUrl}
                      alt={image.fileName}
                      className="h-32 w-full rounded bg-slate-50 object-contain"
                    />
                    <span className="truncate font-mono text-[10px] text-slate-500">
                      {image.fileName} · {(image.bytes / 1024).toFixed(0)} KB
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5 rounded-b-xl text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-3">
            <span>
              共 <b className="text-slate-700">{maxRow + 1}</b> 行 ×{' '}
              <b className="text-slate-700">{maxCol + 1}</b> 列
            </span>
            <span className="hidden sm:inline text-slate-300">|</span>
            <span className="hidden sm:inline text-[11px]">
              右上角带 <span className="text-emerald-600 font-bold">▲</span> 绿标表示包含计算公式
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-md border border-slate-300 bg-white px-3.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              关闭
            </button>
          </div>
        </div>
      </div>

      {lightboxImage && (
        <div
          className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-900/90 p-4"
          onClick={() => setLightboxImage(null)}
        >
          <img
            src={lightboxImage.dataUrl}
            alt={lightboxImage.fileName}
            className="max-h-[86vh] max-w-full rounded-lg bg-white object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="flex items-center gap-3 text-xs text-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="font-mono">
              {lightboxImage.mediaPath} · {(lightboxImage.bytes / 1024).toFixed(0)} KB
            </span>
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="cursor-pointer rounded-md border border-slate-500 bg-slate-800/80 px-3 py-1 font-medium text-slate-100 transition hover:bg-slate-700"
            >
              关闭 (Esc)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
