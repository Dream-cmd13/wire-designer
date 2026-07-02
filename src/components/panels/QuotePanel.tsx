import { Calculator, Download } from 'lucide-react';
import { getProtectiveSleeveDisplayName } from '@/lib/canvasMaterials';
import { LEAD_TIME_OPTIONS } from '@/lib/data';
import { calculatePrice } from '@/lib/pricing';
import { useHarnessStore } from '@/stores/harnessStore';

export function QuotePanel() {
  const { config, setConfig } = useHarnessStore();
  const price = calculatePrice(config);
  const sleeveSummary = config.protectiveSleeves.map((sleeve) => ({
    name: getProtectiveSleeveDisplayName(sleeve),
    lengthMm: sleeve.lengthMm,
    attachedMaterialId: sleeve.attachedMaterialId ?? null,
  }));

  const handleExportEstimate = () => {
    const data = {
      projectName: config.name,
      quantity: config.quantity,
      leadTime: LEAD_TIME_OPTIONS.find((option) => option.id === config.leadTime)?.name || config.leadTime,
      protectiveSleeves: sleeveSummary,
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
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2 font-semibold text-slate-800">
        <Calculator className="h-5 w-5" />
        <h2>报价</h2>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">数量</label>
        <input
          type="number"
          min={1}
          max={1000}
          value={config.quantity}
          onChange={(event) => setConfig({ quantity: Number(event.target.value) })}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">生产交期</label>
        <div className="space-y-1">
          {LEAD_TIME_OPTIONS.map((option) => (
            <label
              key={option.id}
              className={`flex cursor-pointer items-center justify-between rounded border p-2 transition-colors ${
                config.leadTime === option.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="leadTime"
                  checked={config.leadTime === option.id}
                  onChange={() => setConfig({ leadTime: option.id })}
                  className="text-blue-500"
                />
                <span className="text-sm">{option.name}</span>
              </div>
              <span className="text-xs text-slate-500">{option.days}</span>
            </label>
          ))}
        </div>
      </div>


      <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">价格明细</h3>
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">连接器</span>
          <span>${price.connectors.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">线材</span>
          <span>${price.wires.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">加工费</span>
          <span>${price.labor.toFixed(2)}</span>
        </div>
        {price.protection > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">保护套</span>
            <span>${price.protection.toFixed(2)}</span>
          </div>
        )}
        <div className="mt-1 border-t border-slate-200 pt-1">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">交期系数</span>
            <span>x{price.leadTimeMultiplier}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">数量折扣</span>
            <span>x{price.quantityDiscount}</span>
          </div>
        </div>
        <div className="mt-2 border-t border-slate-300 pt-2">
          <div className="flex justify-between text-lg font-semibold">
            <span>单价</span>
            <span className="text-blue-600">${price.unitPrice.toFixed(2)}</span>
          </div>
          <div className="mt-1 flex justify-between text-xl font-bold">
            <span>总价</span>
            <span className="text-green-600">${price.totalPrice.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="mb-2 rounded border border-amber-200 bg-amber-50 p-2">
        <p className="text-xs text-amber-700">此为估算价格，非正式报价。最终价格以实际订单确认为准。</p>
      </div>

      <button
        onClick={handleExportEstimate}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
      >
        <Download className="h-5 w-5" />
        导出估算
      </button>
    </div>
  );
}
