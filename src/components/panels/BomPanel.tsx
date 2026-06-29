import { useMemo } from 'react';
import { useHarnessStore } from '@/stores/harnessStore';
import { generateBOM } from '@/lib/bom';
import { ClipboardList, Plug, Cable, Shield, Download, FileSpreadsheet } from 'lucide-react';

/**
 * BomPanel - Bill of Materials display.
 * Shows a table of all components with quantities and pricing.
 * Supports CSV and Excel (TSV) export.
 */
export function BomPanel() {
  const { config } = useHarnessStore();
  const bomItems = useMemo(() => generateBOM(config), [config]);

  const totalCost = bomItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'connector':
        return <Plug className="w-3.5 h-3.5 text-blue-500" />;
      case 'wire':
        return <Cable className="w-3.5 h-3.5 text-orange-500" />;
      case 'cable':
        return <Cable className="w-3.5 h-3.5 text-purple-500" />;
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
        return '导线';
      case 'cable':
        return '线缆';
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

    // TSV format: tab-separated, .xls extension
    const tsvContent = [headers, ...rows].map((row) => row.join('\t')).join('\n');
    downloadFile('\uFEFF' + tsvContent, `${config.name}_BOM.xls`, 'application/vnd.ms-excel;charset=utf-8;');
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
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-2 py-1.5 text-left text-slate-500 font-medium w-6"></th>
              <th className="px-2 py-1.5 text-left text-slate-500 font-medium">描述</th>
              <th className="px-2 py-1.5 text-right text-slate-500 font-medium w-12">数量</th>
              <th className="px-2 py-1.5 text-right text-slate-500 font-medium w-16">单价</th>
              <th className="px-2 py-1.5 text-right text-slate-500 font-medium w-16">小计</th>
            </tr>
          </thead>
          <tbody>
            {bomItems.map((item, index) => (
              <tr
                key={`${item.type}-${item.description}-${index}`}
                className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors"
              >
                <td className="px-2 py-1.5">{getTypeIcon(item.type)}</td>
                <td className="px-2 py-1.5">
                  <div className="text-slate-700 font-medium truncate max-w-[140px]">
                    {item.description}
                  </div>
                  {item.manufacturer && (
                    <div className="text-[10px] text-slate-400">{item.manufacturer}</div>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right text-slate-600">
                  {item.quantity}
                  {config.quantity > 1 && (
                    <div className="text-[10px] text-slate-400">
                      x{config.quantity} = {item.quantity * config.quantity}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right text-slate-600">
                  {item.unitPrice ? `$${item.unitPrice.toFixed(2)}` : '-'}
                </td>
                <td className="px-2 py-1.5 text-right text-slate-700 font-medium">
                  {item.totalPrice ? `$${item.totalPrice.toFixed(2)}` : '-'}
                </td>
              </tr>
            ))}
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
    </div>
  );
}
