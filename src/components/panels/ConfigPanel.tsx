import { useMemo } from 'react';
import { Settings2, Plug, Cable, Layers3, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { useHarnessStore } from '@/stores/harnessStore';
import { useProjectStore } from '@/stores/projectStore';
import { validateHarness } from '@/lib/validation';
import { PropertyInspector } from './PropertyInspector';
import type { ValidationIssue } from '@/types/harness';

export function ConfigPanel() {
  const config = useHarnessStore((s) => s.config);
  const selection = useHarnessStore((s) => s.selection);
  const setSelection = useHarnessStore((s) => s.setSelection);
  const currentProject = useProjectStore((s) => s.currentProject);
  const updateProject = useProjectStore((s) => s.updateProject);

  const hasSelection = selection.kind !== 'none';
  const inspectorKey = selection.kind === 'none' ? 'none' : `${selection.kind}:${selection.id}`;

  const connectorCount = config?.connectors?.length ?? 0;
  const materialCount = config?.materials?.length ?? 0;
  const sleeveCount = config?.protectiveSleeves?.length ?? 0;

  // Run validation whenever config changes.
  const issues = useMemo(() => validateHarness(config), [config]);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  const handleIssueClick = (issue: ValidationIssue) => {
    if (issue.entity.id && issue.entity.kind !== 'project') {
      setSelection({ kind: issue.entity.kind, id: issue.entity.id } as typeof selection);
    }
  };

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
          onChange={(event) => {
            const nextName = event.target.value;
            useHarnessStore.getState().setConfig({ name: nextName });
            if (currentProject && currentProject.name !== nextName) {
              void updateProject(currentProject.id, { name: nextName });
            }
          }}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryCard icon={<Plug className="h-4 w-4" />} label="连接器" count={connectorCount} />
        <SummaryCard icon={<Cable className="h-4 w-4" />} label="线材" count={materialCount} />
        <SummaryCard icon={<Layers3 className="h-4 w-4" />} label="保护套" count={sleeveCount} />
      </div>

      {/* Validation issues */}
      {issues.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            校验问题
            <span className="text-xs font-normal text-slate-400">
              ({errorCount} 错误 · {warningCount} 警告)
            </span>
          </div>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {issues.map((issue) => (
              <button
                key={issue.id}
                type="button"
                onClick={() => handleIssueClick(issue)}
                className="flex w-full items-start gap-1.5 rounded px-2 py-1 text-left text-xs transition-colors hover:bg-white"
              >
                {issue.severity === 'error' && <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />}
                {issue.severity === 'warning' && <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />}
                {issue.severity === 'info' && <Info className="mt-0.5 h-3 w-3 shrink-0 text-blue-500" />}
                <span className={issue.severity === 'error' ? 'text-red-600' : 'text-slate-600'}>
                  {issue.message}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

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
