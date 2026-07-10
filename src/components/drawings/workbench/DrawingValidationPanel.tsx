import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { HarnessConfig } from '@/types/harness';

interface DrawingValidationPanelProps {
  config: HarnessConfig;
}

export function DrawingValidationPanel({ config }: DrawingValidationPanelProps) {
  const issues: string[] = [];
  if (config.connectors.length === 0) issues.push('缺少连接器。');
  if (config.materials.length === 0) issues.push('缺少线材。');
  if (!config.productionDrawing) issues.push('尚未生成制造图对象。');
  for (const material of config.materials) {
    if (material.spec.lengthMm <= 0) issues.push(`${material.name} 长度无效。`);
    for (const circuit of material.circuits) {
      if (!circuit.signalName.trim()) issues.push(`${material.name} 存在线号为空的接线。`);
      if (material.spec.kind === 'jacketed' && circuit.coreIndex !== undefined && circuit.coreIndex >= material.spec.coreCount) {
        issues.push(`${material.name} 存在超出芯数范围的接线。`);
      }
    }
  }

  return (
    <div className="border-t border-slate-200 bg-white px-4 py-2">
      {issues.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          制造图数据完整，可继续局部编辑或导出。
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs text-amber-700">
          <AlertCircle className="h-4 w-4" />
          {issues.slice(0, 3).map((issue) => (
            <span key={issue} className="rounded-full bg-amber-50 px-2 py-1">{issue}</span>
          ))}
          {issues.length > 3 && <span>另有 {issues.length - 3} 项。</span>}
        </div>
      )}
    </div>
  );
}
