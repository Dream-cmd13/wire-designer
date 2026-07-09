import { useMemo, useState } from 'react';
import { useHarnessStore } from '@/stores/harnessStore';
import { generateBOM } from '@/lib/bom';
import { ClipboardList, Plug, Cable, Shield, Download, FileSpreadsheet, Eye, EyeOff } from 'lucide-react';
import { pdfDrawings } from '@/lib/pdfDrawings';
import { imageAssets } from '@/lib/imageAssets';
import { BomPreviewModal, type AssociatedFile } from './BomPreviewModal';

/**
 * Helper to check associated files for a BOM item.
 */
function getAssociatedFiles(item: any, config: any): AssociatedFile[] {
  const files: AssociatedFile[] = [];

  const sanitize = (name: string) => name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');

  if (item.type === 'connector') {
    const partNum = item.partNumber || '';
    const cleanPartNum = sanitize(partNum);

    // 1. Match from pdfDrawings by partNumber
    if (partNum) {
      for (const pdf of pdfDrawings) {
        if (sanitize(pdf.name).includes(cleanPartNum) || cleanPartNum.includes(sanitize(pdf.name))) {
          files.push({ name: pdf.name + '.pdf', url: pdf.url, type: 'pdf' });
        }
      }
      for (const img of imageAssets) {
        if (sanitize(img.name).includes(cleanPartNum) || cleanPartNum.includes(sanitize(img.name))) {
          files.push({ name: img.name + (img.url.endsWith('.png') ? '.png' : '.jpg'), url: img.url, type: 'image' });
        }
      }
    }

    // 2. Fallback/include generic "连接器" drawings/images if they exist
    for (const pdf of pdfDrawings) {
      if (pdf.name.includes('连接器') && !files.some(f => f.url === pdf.url)) {
        files.push({ name: pdf.name + '.pdf', url: pdf.url, type: 'pdf' });
      }
    }
    for (const img of imageAssets) {
      if (img.name.includes('连接器') && !files.some(f => f.url === img.url)) {
        files.push({ name: img.name + (img.url.endsWith('.png') ? '.png' : '.jpg'), url: img.url, type: 'image' });
      }
    }

    // 3. Match instance-specific images from config.twoDImages
    if (partNum && config.twoDImages) {
      const matchingInstanceIds = config.connectors
        .filter((c: any) => c.connector?.id === partNum)
        .map((c: any) => c.id);
      
      for (const img of config.twoDImages) {
        if (img.elementKind === 'connector' && img.elementId && matchingInstanceIds.includes(img.elementId)) {
          if (!files.some(f => f.url === img.dataUrl)) {
            files.push({ name: img.name + ' (画布渲染图).png', url: img.dataUrl, type: 'image' });
          }
        }
      }
    }
  } else if (item.type === 'wire') {
    const isJacketed = item.description.includes('护套线') || item.description.includes('jacket');
    const isElectronic = item.description.includes('电子线') || item.description.includes('electronic');

    // 1. Match from config.twoDImages if wire images exist
    if (config.materials && config.twoDImages) {
      const matchingMaterialIds = config.materials
        .filter((m: any) => {
          const spec = m.spec;
          let desc = '';
          if (spec.kind === 'electronic') {
            desc = `${spec.awg}AWG 电子线`;
          } else {
            desc = '护套线';
          }
          return item.description.includes(desc);
        })
        .map((m: any) => m.id);

      for (const img of config.twoDImages) {
        if (img.elementKind === 'material' && img.elementId && matchingMaterialIds.includes(img.elementId)) {
          if (!files.some(f => f.url === img.dataUrl)) {
            files.push({ name: img.name + ' (画布渲染图).png', url: img.dataUrl, type: 'image' });
          }
        }
      }
    }

    // 2. Match from catalog files by keywords
    if (isJacketed) {
      for (const pdf of pdfDrawings) {
        if (pdf.name.includes('护套线') && !files.some(f => f.url === pdf.url)) {
          files.push({ name: pdf.name + '.pdf', url: pdf.url, type: 'pdf' });
        }
      }
      for (const img of imageAssets) {
        if (img.name.includes('护套线') && !files.some(f => f.url === img.url)) {
          files.push({ name: img.name + (img.url.endsWith('.png') ? '.png' : '.jpg'), url: img.url, type: 'image' });
        }
      }
    } else if (isElectronic) {
      for (const pdf of pdfDrawings) {
        if (pdf.name.includes('电子线') && !files.some(f => f.url === pdf.url)) {
          files.push({ name: pdf.name + '.pdf', url: pdf.url, type: 'pdf' });
        }
      }
      for (const img of imageAssets) {
        if (img.name.includes('电子线') && !files.some(f => f.url === img.url)) {
          files.push({ name: img.name + (img.url.endsWith('.png') ? '.png' : '.jpg'), url: img.url, type: 'image' });
        }
      }
    }
  } else if (item.type === 'accessory') {
    const desc = item.description.toLowerCase();
    let keyword = '';
    if (desc.includes('波纹') || desc.includes('corrugated')) keyword = '波纹';
    else if (desc.includes('热缩') || desc.includes('heat-shrink') || desc.includes('heat shrink')) keyword = '热缩';
    else if (desc.includes('醋酸') || desc.includes('acetate')) keyword = '醋酸';
    else if (desc.includes('绒布') || desc.includes('fleece')) keyword = '绒布';
    else if (desc.includes('编织') || desc.includes('braided')) keyword = '编织';

    if (keyword) {
      for (const pdf of pdfDrawings) {
        if (pdf.name.includes(keyword) && !files.some(f => f.url === pdf.url)) {
          files.push({ name: pdf.name + '.pdf', url: pdf.url, type: 'pdf' });
        }
      }
      for (const img of imageAssets) {
        if (img.name.includes(keyword) && !files.some(f => f.url === img.url)) {
          files.push({ name: img.name + (img.url.endsWith('.png') ? '.png' : '.jpg'), url: img.url, type: 'image' });
        }
      }
    }
  }

  // Deduplicate files by url
  const seen = new Set<string>();
  return files.filter((f) => {
    if (seen.has(f.url)) return false;
    seen.add(f.url);
    return true;
  });
}

/**
 * BomPanel - Bill of Materials display.
 * Shows a table of all components with quantities and pricing.
 * Supports CSV and Excel (TSV) export.
 */
export function BomPanel() {
  const { config } = useHarnessStore();
  const bomItems = useMemo(() => generateBOM(config), [config]);

  // Modal state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItemName, setPreviewItemName] = useState('');
  const [previewFiles, setPreviewFiles] = useState<AssociatedFile[]>([]);

  const handleOpenPreview = (item: any, files: AssociatedFile[]) => {
    setPreviewItemName(item.description);
    setPreviewFiles(files);
    setPreviewOpen(true);
  };

  const totalCost = bomItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'connector':
        return <Plug className="w-3.5 h-3.5 text-blue-500" />;
      case 'wire':
        return <Cable className="w-3.5 h-3.5 text-orange-500" />;
      case 'accessory':
        return <Shield className="w-3.5 h-3.5 text-green-500" />;
      default:
        return <ClipboardList className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'connector':
        return '连接器';
      case 'wire':
        return '线材';
      case 'accessory':
        return '附件';
      default:
        return type;
    }
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const headers = ['类型', '描述', '制造商', '单位用量', '总用量', '单价', '总价'];
    const rows = bomItems.map((item) => [
      getTypeName(item.type),
      item.description,
      item.manufacturer || '',
      String(item.quantity),
      String(item.quantity * config.quantity),
      item.unitPrice ? item.unitPrice.toFixed(2) : '',
      item.totalPrice ? item.totalPrice.toFixed(2) : '',
    ]);

    // Add total row
    rows.push(['', '', '', '', '', '总计', totalCost.toFixed(2)]);

    const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n');
    downloadFile('\uFEFF' + csvContent, `${config.name}_BOM.csv`, 'text/csv;charset=utf-8;');
  };

  const handleExportExcel = () => {
    const headers = ['类型', '描述', '制造商', '单位用量', '总用量', '单价', '总价'];
    const rows = bomItems.map((item) => [
      getTypeName(item.type),
      item.description,
      item.manufacturer || '',
      String(item.quantity),
      String(item.quantity * config.quantity),
      item.unitPrice ? item.unitPrice.toFixed(2) : '',
      item.totalPrice ? item.totalPrice.toFixed(2) : '',
    ]);

    // Add total row
    rows.push(['', '', '', '', '', '总计', totalCost.toFixed(2)]);

    // TSV format: tab-separated for spreadsheet compatibility
    const tsvContent = [headers, ...rows].map((row) => row.join('\t')).join('\n');
    downloadFile('\uFEFF' + tsvContent, `${config.name}_BOM.tsv`, 'text/tab-separated-values;charset=utf-8;');
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-800 font-semibold">
          <ClipboardList className="w-5 h-5" />
          <h2>BOM物料清单</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleExportCSV}
            className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors cursor-pointer"
            title="导出CSV"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={handleExportExcel}
            className="p-1.5 text-slate-400 hover:text-green-500 hover:bg-green-50 rounded transition-colors cursor-pointer"
            title="导出Excel"
          >
            <FileSpreadsheet className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* BOM Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full table-fixed text-xs">
          <colgroup>
            <col className="w-7" />
            <col />
            <col className="w-10" />
            <col className="w-14" />
            <col className="w-14" />
            <col className="w-10" />
          </colgroup>
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-1 py-1.5 text-left text-slate-500 font-medium"></th>
              <th className="whitespace-nowrap px-1 py-1.5 text-left text-slate-500 font-medium">描述</th>
              <th className="whitespace-nowrap px-1 py-1.5 text-right text-slate-500 font-medium">数量</th>
              <th className="whitespace-nowrap px-1 py-1.5 text-right text-slate-500 font-medium">单价</th>
              <th className="whitespace-nowrap px-1 py-1.5 text-right text-slate-500 font-medium">小计</th>
              <th className="whitespace-nowrap px-1 py-1.5 text-center text-slate-500 font-medium">预览</th>
            </tr>
          </thead>
          <tbody>
            {bomItems.map((item, index) => {
              const itemFiles = getAssociatedFiles(item, config);
              return (
                <tr
                  key={`${item.type}-${item.description}-${index}`}
                  className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors animate-fadeIn"
                >
                  <td className="px-1 py-1.5">{getTypeIcon(item.type)}</td>
                  <td className="min-w-0 px-1 py-1.5">
                    <div
                      className="truncate text-slate-700 font-medium"
                      title={item.description}
                    >
                      {item.description}
                    </div>
                    {item.manufacturer && (
                      <div className="truncate text-[10px] text-slate-400">{item.manufacturer}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-1 py-1.5 text-right text-slate-600">
                    {item.quantity}
                    {config.quantity > 1 && (
                      <div className="text-[10px] text-slate-400">
                        x{config.quantity} = {item.quantity * config.quantity}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-1 py-1.5 text-right text-slate-600">
                    {item.unitPrice ? `$${item.unitPrice.toFixed(2)}` : '-'}
                  </td>
                  <td className="whitespace-nowrap px-1 py-1.5 text-right text-slate-700 font-medium">
                    {item.totalPrice ? `$${item.totalPrice.toFixed(2)}` : '-'}
                  </td>
                  <td className="whitespace-nowrap px-1 py-1.5 text-center">
                    {itemFiles.length > 0 ? (
                      <button
                        onClick={() => handleOpenPreview(item, itemFiles)}
                        className="inline-flex items-center justify-center p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                        title={`查看 ${itemFiles.length} 个关联文件`}
                      >
                        <Eye className="w-4.5 h-4.5" />
                      </button>
                    ) : (
                      <button
                        disabled
                        className="inline-flex items-center justify-center p-1 text-slate-300 rounded cursor-not-allowed"
                        title="暂无关联文件"
                      >
                        <EyeOff className="w-4.5 h-4.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Total */}
      <div className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
        <span className="text-xs text-slate-500">
          共 {bomItems.length} 项物料
          {config.quantity > 1 && ` (x${config.quantity}套)`}
        </span>
        <span className="text-sm font-bold text-slate-800">
          总计: ${totalCost.toFixed(2)}
        </span>
      </div>

      {/* Preview Modal */}
      <BomPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        itemName={previewItemName}
        files={previewFiles}
      />
    </div>
  );
}
