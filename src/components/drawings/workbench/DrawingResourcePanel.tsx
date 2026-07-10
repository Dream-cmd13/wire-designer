import { Cable, CircuitBoard, Layers, Plug } from 'lucide-react';
import type { HarnessConfig } from '@/types/harness';

interface DrawingResourcePanelProps {
  config: HarnessConfig;
}

export function DrawingResourcePanel({ config }: DrawingResourcePanelProps) {
  const firstMaterial = config.materials[0];
  const circuitCount = config.materials.reduce((count, material) => count + material.circuits.length, 0);
  const wiringTable = config.productionDrawing?.objects.find((object) => object.kind === 'wiring-table');

  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-3">
      <div className="mb-3 flex items-center gap-2">
        <Layers className="h-4 w-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-slate-900">绘图资源</h3>
      </div>
      <div className="space-y-3 text-sm">
        <section className="rounded-md border border-slate-200 p-3">
          <div className="mb-2 flex items-center gap-2 font-medium text-slate-800">
            <Plug className="h-4 w-4 text-slate-500" />
            连接器/模型
          </div>
          <div className="space-y-1 text-xs text-slate-600">
            {config.connectors.length === 0 ? (
              <p>暂无连接器。</p>
            ) : config.connectors.map((connector) => (
              <p key={connector.id} className="truncate">
                {connector.label} · {connector.connector.name} · {connector.connector.pinCount}PIN
              </p>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-slate-200 p-3">
          <div className="mb-2 flex items-center gap-2 font-medium text-slate-800">
            <Cable className="h-4 w-4 text-slate-500" />
            线材
          </div>
          <div className="space-y-1 text-xs text-slate-600">
            <p>{config.materials.length} 个线材对象</p>
            <p>{circuitCount} 条接线明细</p>
            {firstMaterial && (
              <p>
                {firstMaterial.spec.kind === 'jacketed'
                  ? `${firstMaterial.spec.coreCount} 芯护套线`
                  : `${config.materials.length} 条电子线`}
              </p>
            )}
          </div>
        </section>

        <section className="rounded-md border border-slate-200 p-3">
          <div className="mb-2 flex items-center gap-2 font-medium text-slate-800">
            <CircuitBoard className="h-4 w-4 text-slate-500" />
            制造图对象
          </div>
          <div className="space-y-1 text-xs text-slate-600">
            <p>{config.productionDrawing?.objects.length ?? 0} 个图纸对象</p>
            <p>{wiringTable?.rows.length ?? 0} 行接线表明细</p>
            <p>{config.productionDrawing?.titleBlock.drawingNo ?? '未生成图号'}</p>
          </div>
        </section>
      </div>
    </aside>
  );
}
