import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { downloadBlob } from '@/lib/drawingExport';
import { buildModelThreeViewPdf, createModelFrontPreview, DEFAULT_MODEL_FRONT, getModelThreeViewFilename, MODEL_FRONT_DIRECTIONS, type ModelFrontDirection } from '@/lib/models/modelThreeViewExport';
import type { ParsedModel } from '@/lib/models/modelTypes';

export function ModelThreeViewDialog({ model, sourceName, modelSignal, onClose }: {
  model: ParsedModel; sourceName: string; modelSignal: AbortSignal; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const previewSource = useRef<ReturnType<typeof createModelFrontPreview> | null>(null);
  const pending = useRef<AbortController | null>(null);
  const headingId = useId();
  const [front, setFront] = useState<ModelFrontDirection>(DEFAULT_MODEL_FRONT);
  const [shown, setShown] = useState<{ front: ModelFrontDirection; failed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const frontReady = shown?.front === front && !shown.failed;

  const releasePreview = () => { previewSource.current?.dispose(); previewSource.current = null; };

  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { pending.current?.abort(); releasePreview(); element?.close(); };
  }, [model]);

  useEffect(() => {
    if (busy) return;
    const frame = requestAnimationFrame(() => {
      if (!canvas.current || modelSignal.aborted || pending.current) return;
      try {
        previewSource.current ??= createModelFrontPreview(model, canvas.current);
        previewSource.current.draw(front);
        setShown({ front, failed: false });
      } catch { releasePreview(); setShown({ front, failed: true }); }
    });
    return () => cancelAnimationFrame(frame);
  }, [busy, front, model, modelSignal]);

  const cancel = () => { pending.current?.abort(); onClose(); };
  const download = async () => {
    if (pending.current || modelSignal.aborted) return;
    const request = new AbortController();
    pending.current = request;
    const signal = AbortSignal.any([modelSignal, request.signal]);
    setBusy(true); setError('');
    try {
      releasePreview(); // The preview pixels are already in the 2D canvas.
      const pdf = await buildModelThreeViewPdf(model, sourceName, front, signal);
      if (signal.aborted) return;
      downloadBlob(pdf, getModelThreeViewFilename(sourceName));
      onClose();
    } catch (cause) {
      if (!signal.aborted) setError(`导出失败，请重试。${cause instanceof Error ? ` ${cause.message}` : ''}`);
    } finally {
      pending.current = null;
      if (!signal.aborted) setBusy(false);
    }
  };

  return <dialog ref={dialog} aria-labelledby={headingId}
    onCancel={(event) => { event.preventDefault(); cancel(); }}
    className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-md rounded-xl bg-white p-5 shadow-xl backdrop:bg-black/40">
    <h2 id={headingId} className="text-lg font-semibold">确认三视图前视面</h2>
    <p className="mt-1 truncate text-sm text-slate-600" title={sourceName}>{sourceName}</p>
    <label className="my-4 flex items-center justify-between gap-3 text-sm">前视方向
      <select className="rounded-md border border-slate-300 bg-white px-2 py-1.5" disabled={busy} value={front}
        onChange={(event) => { setShown(null); setFront(event.target.value as ModelFrontDirection); setError(''); }}>
        {Object.keys(MODEL_FRONT_DIRECTIONS).map((axis) => <option key={axis} value={axis}>从 {axis.replace('-', '−')} 看</option>)}
      </select>
    </label>
    <div className="relative aspect-16/9 overflow-hidden rounded-md border border-slate-200 bg-white">
      <canvas ref={canvas} width={512} height={288} role="img" aria-label="前视预览" className={`block h-full w-full ${frontReady ? '' : 'invisible'}`} />
      {!frontReady && <p role="status" className="absolute inset-0 grid place-items-center px-3 text-center text-sm text-slate-600">
        {shown?.front === front && shown.failed ? '前视预览未能绘制' : '正在绘制前视…'}
      </p>}
    </div>
    <p className="mt-3 text-xs leading-relaxed text-slate-600">A4 横向 · 第一角法 · 三视图同比例<br />仅供外形参考，不用于加工或量测。</p>
    {error && <p role="alert" className="mt-3 break-words text-sm text-red-700">{error}</p>}
    <div className="mt-4 flex flex-wrap justify-end gap-2">
      <button type="button" className="rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50" onClick={cancel}>取消</button>
      <button type="button" className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        aria-busy={busy} disabled={busy} onClick={() => void download()}><Download size={16} />{busy ? '正在生成 PDF…' : '下载 PDF'}</button>
    </div>
  </dialog>;
}
