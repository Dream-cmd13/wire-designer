import { useMemo, useState } from 'react';
import { Check, Filter, Search, X } from 'lucide-react';
import { isSupportedConnector } from '@/lib/autoQuote';
import type { Connector } from '@/types/harness';

interface ConnectorPickerModalProps {
  isOpen: boolean;
  title: string;
  connectors: Connector[];
  selectedId: string;
  onSelect: (connector: Connector) => void;
  onClose: () => void;
}

export function ConnectorPickerModal({
  isOpen,
  title,
  connectors,
  selectedId,
  onSelect,
  onClose,
}: ConnectorPickerModalProps) {
  const [keyword, setKeyword] = useState('');
  const [onlySupported, setOnlySupported] = useState(true);

  const filteredConnectors = useMemo(() => {
    let list = connectors;
    if (onlySupported) {
      list = list.filter(isSupportedConnector);
    }
    const q = keyword.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => (
        c.name.toLowerCase().includes(q)
        || (c.model?.toLowerCase().includes(q) ?? false)
        || (c.series?.toLowerCase().includes(q) ?? false)
        || (c.supplierNo?.toLowerCase().includes(q) ?? false)
      ));
    }
    return list;
  }, [connectors, keyword, onlySupported]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50/80">
          <div>
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500 font-normal">首版自动报价公式支持 M8 与 M12 工业连接器</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 搜索与过滤栏 */}
        <div className="border-b border-slate-100 p-3 bg-white space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索连接器名称、型号、系列或供应商..."
              className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600 px-1">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={onlySupported}
                onChange={(e) => setOnlySupported(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="font-medium">仅显示公式支持的 M8 / M12 系列</span>
            </label>
            <span className="text-slate-400">
              共 {filteredConnectors.length} 个候选物料
            </span>
          </div>
        </div>

        {/* 物料列表 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[50vh]">
          {filteredConnectors.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              <Filter className="mx-auto h-8 w-8 text-slate-300 mb-2" />
              未找到符合条件的连接器物料
            </div>
          ) : (
            filteredConnectors.map((connector) => {
              const selected = connector.id === selectedId;
              const supported = isSupportedConnector(connector);
              return (
                <div
                  key={connector.id}
                  onClick={() => {
                    onSelect(connector);
                    onClose();
                  }}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition ${
                    selected
                      ? 'border-blue-500 bg-blue-50/70 shadow-xs'
                      : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {connector.image ? (
                      <img
                        src={connector.image}
                        alt={connector.name}
                        className="h-12 w-12 shrink-0 rounded-md border border-slate-200 bg-white object-contain p-1"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-500">
                        {connector.series || 'CONN'}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800 truncate">
                          {connector.name}
                        </span>
                        {supported ? (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                            支持在线报价
                          </span>
                        ) : (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                            非 M8/M12 需核价
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 flex flex-wrap gap-x-2">
                        <span>型号: {connector.model || connector.id}</span>
                        <span>·</span>
                        <span>{connector.pinCount} Pin</span>
                        <span>· {connector.shielded === undefined ? '屏蔽属性未维护' : connector.shielded ? '屏蔽' : '非屏蔽'}</span>
                        <span>·</span>
                        <span>{connector.type === 'male' ? '公头' : connector.type === 'female' ? '母头' : '插座'}</span>
                        {connector.supplierNo && (
                          <>
                            <span>·</span>
                            <span>{connector.supplierNo}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 pl-3">
                    {selected ? (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">
                        <Check className="h-4 w-4" />
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-blue-600 font-medium hover:underline"
                      >
                        选择
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 底部 */}
        <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
