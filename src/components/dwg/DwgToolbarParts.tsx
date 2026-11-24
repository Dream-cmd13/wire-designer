import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export const toolbarButtonClass =
  'flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50';

export type EditConfirmation = 'generate' | 'discard';

export function ToolbarDetails({ label, tone, children }: { label: string; tone: string; children: ReactNode }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const details = detailsRef.current;
    const panel = panelRef.current;
    const toolbar = details?.closest<HTMLElement>('[data-page-header], [data-dwg-toolbar]');
    if (!details || !panel || !toolbar) return;

    const placePanel = () => {
      if (!details.open || !details.getClientRects().length) return;
      const trigger = details.getBoundingClientRect();
      const boundary = toolbar.getBoundingClientRect();
      const gutter = parseFloat(getComputedStyle(toolbar).paddingLeft);
      const maxLeft = boundary.width - panel.getBoundingClientRect().width - gutter;
      const left = Math.max(gutter, Math.min(trigger.left - boundary.left, maxLeft));
      panel.style.setProperty('--dwg-detail-x', `${left}px`);
      panel.style.setProperty('--dwg-detail-y', `${trigger.bottom - boundary.top}px`);
    };

    details.addEventListener('toggle', placePanel);
    const observer = new ResizeObserver(placePanel);
    observer.observe(toolbar);
    observer.observe(details);
    if (details.parentElement) observer.observe(details.parentElement);
    return () => {
      observer.disconnect();
      details.removeEventListener('toggle', placePanel);
    };
  }, []);

  return (
    <details ref={detailsRef} name="dwg-header-details">
      <summary className={`flex cursor-pointer list-none items-center gap-1 rounded px-2 py-0.5 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden ${tone}`}>
        {label} <ChevronDown className="h-3 w-3" />
      </summary>
      <div ref={panelRef} className="absolute left-[var(--dwg-detail-x)] top-[var(--dwg-detail-y)] z-50 mt-1 w-80 max-w-[calc(100%-2rem)] rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-lg">
        {children}
      </div>
    </details>
  );
}

export function ToolbarError({ id, message }: { id: string; message: string | null }) {
  return message && <span id={id} role="alert" className="min-w-0 max-w-44 break-words rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">{message}</span>;
}

export function DwgEditConfirmation({ action, onCancel, onConfirm }: {
  action: EditConfirmation;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const discard = action === 'discard';

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog ref={dialogRef} role="alertdialog" aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
      className="fixed inset-0 m-auto w-[calc(100%-1.5rem)] max-w-sm rounded-lg border border-slate-200 bg-white p-4 text-slate-900 shadow-xl backdrop:bg-black/40">
      <h2 id={titleId} className="text-base font-semibold">{discard ? '放弃当前 DWG 草稿？' : '确认生成 DWG？'}</h2>
      <p id={descriptionId} className="mt-2 text-sm text-slate-600">
        {discard ? '退出编辑会丢弃本次草稿和预览。' : '当前原图将发送到本系统的转换服务，文件仅用于本次处理。'}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={toolbarButtonClass}>取消</button>
        <button type="button" onClick={onConfirm}
          className={`h-8 cursor-pointer rounded-md px-2.5 text-xs font-medium text-white ${discard ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
          {discard ? '放弃草稿' : '确认生成'}
        </button>
      </div>
    </dialog>
  );
}
