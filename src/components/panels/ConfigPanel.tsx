import { Settings2, Plug, Cable, Layers3 } from 'lucide-react';
import { useHarnessStore } from '@/stores/harnessStore';
import { PropertyInspector } from './PropertyInspector';

export function ConfigPanel() {
  const { config, selection } = useHarnessStore();

  const hasSelection = selection.kind !== 'none';
  const inspectorKey = selection.kind === 'none' ? 'none' : `${selection.kind}:${selection.id}`;

  const connectorCount = config?.connectors?.length ?? 0;
  const materialCount = config?.materials?.length ?? 0;
  const sleeveCount = config?.protectiveSleeves?.length ?? 0;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2 font-semibold text-slate-800">
        <Settings2 className="h-5 w-5" />
        <h2>配置参数</h2>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">设计名称</label>
        <input
          type="text"
          value={config.name}
          onChange={(event) => useHarnessStore.getState().setConfig({ name: event.target.value })}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryCard icon={<Plug className="h-4 w-4" />} label="连接器" count={connectorCount} />
        <SummaryCard icon={<Cable className="h-4 w-4" />} label="线材" count={materialCount} />
        <SummaryCard icon={<Layers3 className="h-4 w-4" />} label="保护套" count={sleeveCount} />
      </div>

      {hasSelection && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
          <PropertyInspector key={inspectorKey} />
        </div>
      )}

      {!hasSelection && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-400">
          <p>选择画布中的连接器、线材或保护套以编辑属性</p>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-slate-200 bg-slate-50 p-2">
      <span className="text-slate-400">{icon}</span>
      <span className="mt-1 text-lg font-bold text-slate-700">{count}</span>
      <span className="text-[10px] text-slate-400">{label}</span>
    </div>
  );
}
