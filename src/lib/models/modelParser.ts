import { MODEL_LIMITS, type ModelFormat, type ParsedModel, type ParsePhase, type ParseReply, type StlUnit } from './modelTypes';

export function validateModelFile(file: { name: string; size: number }): ModelFormat {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['step', 'stp', 'stl'].includes(extension ?? '')) throw new Error('请选择 STEP / STP / STL 模型文件。');
  if (file.size < 1) throw new Error('文件为空，请重新选择。');
  if (file.size > MODEL_LIMITS.maxBytes) throw new Error('文件超过 20 MiB 上限，请简化模型后重试。');
  return extension === 'stl' ? 'stl' : 'step';
}

let nextRequest = 0;
export function parseModel(file: Blob, options: {
  format: ModelFormat; stlUnit: StlUnit; signal: AbortSignal; onPhase?: (phase: ParsePhase) => void;
}): Promise<ParsedModel> {
  return new Promise((resolve, reject) => {
    if (options.signal.aborted) { reject(new DOMException('已取消', 'AbortError')); return; }
    if (file.size < 1 || file.size > MODEL_LIMITS.maxBytes) { reject(new Error('请选择非空且不超过 20 MiB 的文件。')); return; }
    let worker: Worker;
    try { worker = new Worker(new URL('./modelParser.worker.ts', import.meta.url), { type: 'module' }); }
    catch { reject(new Error('无法启动解析线程，请使用支持 Web Worker 的浏览器后重试。')); return; }
    const requestId = ++nextRequest;
    let settled = false;
    const finish = (error?: Error, model?: ParsedModel) => {
      if (settled) return;
      settled = true; clearTimeout(timer); options.signal.removeEventListener('abort', abort);
      worker.terminate();
      if (error) reject(error); else resolve(model!);
    };
    const abort = () => finish(new DOMException('已取消', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('模型解析超时（60 秒），请简化模型后重试。')), MODEL_LIMITS.timeoutMs);
    options.signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<ParseReply>) => {
      if (settled || data.requestId !== requestId) return;
      if (data.type === 'phase') options.onPhase?.(data.phase);
      else if (data.type === 'error') finish(new Error(data.message));
      else finish(undefined, data.model);
    };
    worker.onerror = () => finish(new Error('解析引擎运行失败，请检查浏览器内存和本地引擎资源后重试。'));
    options.onPhase?.('reading');
    file.arrayBuffer().then((buffer) => {
      if (settled) return;
      const assetBase = new URL(`${import.meta.env.BASE_URL}model-engine/`, globalThis.location?.href ?? 'http://localhost/').href;
      worker.postMessage({ requestId, buffer, format: options.format, stlUnit: options.stlUnit, assetBase }, [buffer]);
    }).catch(() => finish(new Error('读取文件失败，请重新选择文件。')));
  });
}
