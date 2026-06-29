import { useState, type ReactNode } from 'react';
import { Cable, List, Settings2, Table as TableIcon } from 'lucide-react';
import { useHarnessStore } from '@/stores/harnessStore';
import { ConnectorPinView } from './ConnectorPinView';
import { PinMatrixPanel } from './PinMatrixPanel';
import { PropertyInspector } from './PropertyInspector';
import { WireListPanel } from './WireListPanel';
import { WireTablePanel } from './WireTablePanel';

type PanelTab = 'wireList' | 'pinMatrix' | 'wireTable';

export function ConfigPanel() {
  const { config, selection } = useHarnessStore();
  const [activeTab, setActiveTab] = useState<PanelTab>('wireList');

  const hasSelection = selection.kind !== 'none';
  const selectedNode =
    selection.kind === 'node'
      ? config.nodes.find((node) => node.id === selection.id)
      : null;
  const inspectorKey = selection.kind === 'none' ? 'none' : `${selection.kind}:${selection.id}`;

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

      {hasSelection && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
          <PropertyInspector key={inspectorKey} />
        </div>
      )}

      {selectedNode && <ConnectorPinView />}

      <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
        <TabButton
          active={activeTab === 'wireList'}
          onClick={() => setActiveTab('wireList')}
          icon={<List className="h-3 w-3" />}
          label="导线列表"
        />
        <TabButton
          active={activeTab === 'pinMatrix'}
          onClick={() => setActiveTab('pinMatrix')}
          icon={<Cable className="h-3 w-3" />}
          label="连接矩阵"
        />
        <TabButton
          active={activeTab === 'wireTable'}
          onClick={() => setActiveTab('wireTable')}
          icon={<TableIcon className="h-3 w-3" />}
          label="接线表"
        />
      </div>

      {activeTab === 'pinMatrix' && <PinMatrixPanel />}
      {activeTab === 'wireTable' && <WireTablePanel />}
      {!hasSelection && activeTab === 'wireList' && <WireListPanel />}
    </div>
  );
}

function TabButton({
  active,
  disabled,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-1 cursor-pointer items-center justify-center gap-1 rounded py-1.5 text-xs transition-colors ${
        disabled
          ? 'cursor-not-allowed text-slate-300'
          : active
            ? 'bg-white font-medium text-blue-700 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
