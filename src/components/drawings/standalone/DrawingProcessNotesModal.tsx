import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { DRAWING_PROCESS_PRESETS } from '@/lib/drawingStaticResources';
import type { DrawingCommonPhrase } from '@/types/drawing';

export type ProcessNotesTab = 'process' | 'tech' | 'phrases';

interface DrawingProcessNotesModalProps {
  initialTab?: ProcessNotesTab;
  selectedNotes: string[];
  phrases: DrawingCommonPhrase[];
  onClose: () => void;
  onConfirm: (notes: string[]) => void;
}

export function DrawingProcessNotesModal({
  initialTab = 'process',
  selectedNotes,
  phrases,
  onClose,
  onConfirm,
}: DrawingProcessNotesModalProps) {
  const [tab, setTab] = useState<ProcessNotesTab>(initialTab);
  const [selected, setSelected] = useState<string[]>(() => [...selectedNotes]);

  const toggleNote = (content: string) => {
    setSelected((current) => (
      current.includes(content)
        ? current.filter((item) => item !== content)
        : [...current, content]
    ));
  };

  const presetItems = DRAWING_PROCESS_PRESETS.filter((item) => item.tab === tab);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="选择工艺说明">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h3 className="text-base font-medium text-slate-900">选择工艺说明</h3>
          <button type="button" onClick={onClose} aria-label="关闭工艺说明" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex gap-6 border-b border-slate-200 px-6">
          {([
            ['process', '工艺'],
            ['tech', '技术'],
            ['phrases', '常用语'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`border-b-2 py-2.5 text-sm font-medium transition-colors ${
                tab === key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-[260px] flex-1 space-y-3 overflow-y-auto p-5">
          {(tab === 'process' || tab === 'tech') && presetItems.map((preset) => {
            const active = selected.includes(preset.content);
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => toggleNote(preset.content)}
                aria-pressed={active}
                className={`relative block w-full rounded-lg border p-4 pr-11 text-left transition ${
                  active
                    ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500'
                    : 'border-slate-200 bg-white hover:border-blue-300'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute right-4 top-4 flex h-4 w-4 items-center justify-center rounded-full border ${
                    active ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300 bg-white'
                  }`}
                >
                  {active && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                </span>
                <pre className="whitespace-pre-wrap font-sans text-xs leading-6 text-slate-700">{preset.content}</pre>
              </button>
            );
          })}

          {tab === 'phrases' && (
            <div className="space-y-2">
              {phrases.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                  暂无常用语。
                </p>
              )}
              {phrases.map((phrase) => {
                const active = selected.includes(phrase.phrase);
                return (
                  <button
                    key={phrase.id}
                    type="button"
                    onClick={() => toggleNote(phrase.phrase)}
                    aria-pressed={active}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition ${
                      active
                        ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500'
                        : 'border-slate-200 bg-white hover:border-blue-300'
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{phrase.category}</span>
                      <span className="text-xs text-slate-700">{phrase.phrase}</span>
                    </div>
                    <span
                      aria-hidden="true"
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        active ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {active && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
          <span className="text-xs text-slate-500">已选择 {selected.length} 项说明</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => onConfirm(selected)}
              className="rounded-md bg-blue-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
            >
              确定
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
