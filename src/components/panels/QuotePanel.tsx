import { useHarnessStore } from '@/stores/harnessStore';
import { calculatePrice } from '@/lib/pricing';
import { LEAD_TIME_OPTIONS, PROTECTION_OPTIONS } from '@/lib/data';
import { Calculator, Download } from 'lucide-react';

export function QuotePanel() {
  const { config, setConfig } = useHarnessStore();
  const price = calculatePrice(config);

  const handleExportEstimate = () => {
    const data = {
      projectName: config.name,
      quantity: config.quantity,
      leadTime: LEAD_TIME_OPTIONS.find(o => o.id === config.leadTime)?.name || config.leadTime,
      protection: PROTECTION_OPTIONS.find(p => p.id === config.protection)?.name || '无',
      priceBreakdown: price,
      date: new Date().toISOString(),
      disclaimer: '此为估算价格，非正式报价。最终价格以实际订单确认为准。',
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.name}_报价估算.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 text-slate-800 font-semibold">
        <Calculator className="w-5 h-5" />
        <h2>报价</h2>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-600 mb-1">数量</label>
        <input type="number" min={1} max={1000} value={config.quantity} onChange={(e) => setConfig({ quantity: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-600 mb-1">生产交期</label>
        <div className="space-y-1">
          {LEAD_TIME_OPTIONS.map((opt) => (
            <label key={opt.id} className={`flex items-center justify-between p-2 rounded border cursor-pointer transition-colors ${config.leadTime === opt.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <div className="flex items-center gap-2">
                <input type="radio" name="leadTime" checked={config.leadTime === opt.id} onChange={() => setConfig({ leadTime: opt.id })} className="text-blue-500" />
                <span className="text-sm">{opt.name}</span>
              </div>
              <span className="text-xs text-slate-500">{opt.days}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-600 mb-1">保护套</label>
        <select value={config.protection || 'none'} onChange={(e) => setConfig({ protection: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm">
          {PROTECTION_OPTIONS.map((p) => <option key={p.id} value={p.id}>{p.name} {p.price > 0 ? `(+$${p.price.toFixed(2)})` : ''}</option>)}
        </select>
      </div>
      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">价格明细</h3>
        <div className="flex justify-between text-sm"><span className="text-slate-600">连接器</span><span>${price.connectors.toFixed(2)}</span></div>
        <div className="flex justify-between text-sm"><span className="text-slate-600">线缆</span><span>${price.wires.toFixed(2)}</span></div>
        <div className="flex justify-between text-sm"><span className="text-slate-600">加工费</span><span>${price.labor.toFixed(2)}</span></div>
        {price.protection > 0 && <div className="flex justify-between text-sm"><span className="text-slate-600">保护套</span><span>${price.protection.toFixed(2)}</span></div>}
        <div className="border-t border-slate-200 pt-1 mt-1">
          <div className="flex justify-between text-sm"><span className="text-slate-600">交期系数</span><span>x{price.leadTimeMultiplier}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-600">数量折扣</span><span>x{price.quantityDiscount}</span></div>
        </div>
        <div className="border-t border-slate-300 pt-2 mt-2">
          <div className="flex justify-between font-semibold text-lg"><span>单价</span><span className="text-blue-600">${price.unitPrice.toFixed(2)}</span></div>
          <div className="flex justify-between font-bold text-xl mt-1"><span>总价</span><span className="text-green-600">${price.totalPrice.toFixed(2)}</span></div>
        </div>
      </div>
      <div className="bg-amber-50 p-2 rounded border border-amber-200 mb-2">
        <p className="text-xs text-amber-700">⚠️ 此为估算价格，非正式报价。最终价格以实际订单确认为准。</p>
      </div>
      <button
        onClick={handleExportEstimate}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
      >
        <Download className="w-5 h-5" />导出估算
      </button>
    </div>
  );
}
