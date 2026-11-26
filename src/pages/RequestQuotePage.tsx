import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Loader2, Upload, X } from 'lucide-react';
import { QuoteSubmissionError, sendQuoteRequest } from '@/lib/quoteRequests';
import {
  getQuoteRequestFieldErrors, hasQuoteFileSignature, QUOTE_FILE_ACCEPT, QUOTE_FILE_MAX_COUNT, QUOTE_FILE_MAX_MIB, QUOTE_KINDS,
  quoteFileHash, validateQuoteFile, validateQuoteRequest,
} from '../../supabase/functions/_shared/quoteRequest';

const kindHints = {
  按图加工: '可上传已有图纸，并补充预计数量和交期。',
  新线束设计: '可描述用途、长度、两端接口和使用环境。',
  按样品评估: '可提供样品照片、尺寸和预计数量。',
} satisfies Record<(typeof QUOTE_KINDS)[number], string>;

const emptyFields = { name: '', phone: '', email: '', company: '', demand: '', kind: '' };
const inputClass = 'mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100 aria-invalid:border-red-600 aria-invalid:focus:ring-red-100';
const fieldErrorClass = 'mt-1 text-xs leading-5 text-red-700';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold disabled:opacity-60';

export default function RequestQuotePage() {
  const [fields, setFields] = useState(emptyFields);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [uploaded, setUploaded] = useState<number[]>([]);
  const [receipt, setReceipt] = useState('');
  const [copied, setCopied] = useState(false);
  const submitting = useRef(false);
  const attempt = useRef<{ id: string; fingerprint: string; uploaded: Set<number> } | null>(null);
  const addDrawing = useRef<HTMLButtonElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const busy = Boolean(progress);
  const fieldErrors = showFieldErrors ? getQuoteRequestFieldErrors(fields, files.length > 0) : {};
  const kindHint = QUOTE_KINDS.find((kind) => kind === fields.kind);

  function changeField(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = event.currentTarget;
    setFields((current) => ({ ...current, [name]: value }));
    setUploaded([]);
    setError('');
  }

  function addFiles(list: FileList | null) {
    if (submitting.current || !list) return;
    const next = [...files];
    const errors: string[] = [];
    for (const file of Array.from(list)) {
      try {
        validateQuoteFile(file.name, file.size);
        if (next.some((other) => other.name === file.name && other.size === file.size && other.lastModified === file.lastModified)) continue;
        if (next.length >= QUOTE_FILE_MAX_COUNT) throw new Error('最多上传 5 份图纸。');
        next.push(file);
      } catch (problem) {
        const message = (problem as Error).message;
        if (!errors.includes(message)) errors.push(message);
      }
    }
    if (next.length !== files.length) {
      setFiles(next);
      setUploaded([]);
      setError('');
    }
    setFileError(errors.join(' '));
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError('');
    const validation = getQuoteRequestFieldErrors(fields, files.length > 0);
    const firstInvalid = validation.demand ? 'demand'
      : validation.name ? 'name'
        : validation.contact || validation.phone ? 'phone'
          : validation.email ? 'email' : null;
    if (firstInvalid) {
      setShowFieldErrors(true);
      const field = event.currentTarget.elements.namedItem(firstInvalid);
      if (field instanceof HTMLElement) requestAnimationFrame(() => field.focus());
      return;
    }

    submitting.current = true;
    setFileError('');
    setProgress('正在检查资料…');
    try {
      const attachments = [];
      for (const file of files) {
        const bytes = await file.arrayBuffer();
        if (!hasQuoteFileSignature(file.name, new Uint8Array(bytes))) {
          setFileError(`「${file.name}」的内容与文件格式不符，请重新选择。`);
          requestAnimationFrame(() => addDrawing.current?.focus());
          return;
        }
        attachments.push({ name: file.name, size: file.size, sha256: await quoteFileHash(bytes) });
      }
      const input = validateQuoteRequest({ ...fields, files: attachments });
      const fingerprint = JSON.stringify(input);
      if (attempt.current?.fingerprint !== fingerprint) {
        attempt.current = { id: crypto.randomUUID(), fingerprint, uploaded: new Set() };
        setUploaded([]);
      }
      const active = attempt.current;
      setUploaded([...active.uploaded]);
      setProgress('正在提交询价…');
      const prepared = await sendQuoteRequest<{ uploading?: boolean; receipt?: string }>('prepare', { id: active.id, input });
      if (prepared.receipt) {
        setReceipt(prepared.receipt);
        return;
      }
      if (!prepared.uploading) throw new Error('询价服务返回异常，请重试。');
      for (const [index, file] of files.entries()) {
        if (active.uploaded.has(index)) continue;
        setProgress(`正在上传图纸 ${index + 1}/${files.length} · ${file.name}`);
        await sendQuoteRequest('upload', file, { 'x-quote-request-id': active.id, 'x-quote-file-index': String(index) });
        active.uploaded.add(index);
        setUploaded([...active.uploaded]);
      }
      setProgress('正在确认询价…');
      const result = await sendQuoteRequest<{ receipt?: string }>('finalize', { id: active.id });
      if (!result.receipt) throw new Error('暂未收到询价编号，请重试。');
      setReceipt(result.receipt);
    } catch (problem) {
      if (problem instanceof QuoteSubmissionError) {
        if (problem.code === 'expired' || problem.code === 'conflict') attempt.current = null;
        if (problem.code === 'missing_files') attempt.current?.uploaded.clear();
        if (problem.code) setUploaded([]);
      }
      setError(problem instanceof Error ? problem.message : '提交失败，请稍后重试。');
    } finally {
      submitting.current = false;
      setProgress('');
    }
  }

  function reset() {
    attempt.current = null;
    setFields(emptyFields);
    setFiles([]);
    setReceipt('');
    setCopied(false);
    setUploaded([]);
    setFileError('');
    setShowFieldErrors(false);
    setError('');
  }

  if (receipt) return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <section aria-label="询价回执" className="rounded-xl border border-slate-200 bg-white px-5 py-10 text-center shadow-sm sm:px-10">
        <CheckCircle2 aria-hidden="true" className="mx-auto mb-4 h-10 w-10 text-emerald-600" />
        <h2 className="text-xl font-semibold text-slate-900">已收到询价</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">专员将按您留下的方式联系，确认需求后提供报价。</p>
        <p className="mt-5 break-all rounded-md bg-slate-100 p-3 font-mono text-sm text-slate-900">{receipt}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => void navigator.clipboard.writeText(receipt).then(() => setCopied(true)).catch(() => setCopied(false))} className={`${buttonClass} bg-blue-700 text-white hover:bg-blue-800`}>{copied ? '已复制' : '复制询价编号'}</button>
          <button type="button" onClick={reset} className={`${buttonClass} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>提交另一条询价</button>
        </div>
      </section>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl px-3 py-4 sm:px-6 sm:py-6">
      <p className="mb-4 text-sm leading-6 text-slate-600">描述需求或上传图纸，专员确认后提供报价。无需登录。</p>
      <form noValidate onSubmit={(event) => void submit(event)} className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <fieldset disabled={busy} className="min-w-0 space-y-4 px-4 py-4 sm:px-7">
          <section className="space-y-3" aria-labelledby="quote-demand-title">
            <div>
              <h2 id="quote-demand-title" className="font-semibold text-slate-900">需求与图纸</h2>
              <p id="quote-demand-help" className="mt-1 text-xs leading-5 text-slate-600">需求说明或图纸，至少提供一项。</p>
            </div>
            <div>
              <p id="quote-kind-label" className="mb-1.5 text-sm text-slate-800">需求类型 <span className="text-slate-500">（选填）</span></p>
              <div className="flex flex-wrap gap-2" role="group" aria-labelledby="quote-kind-label">
                {QUOTE_KINDS.map((kind) => (
                  <button key={kind} type="button" aria-pressed={fields.kind === kind} onClick={() => { setFields((previous) => ({ ...previous, kind: previous.kind === kind ? '' : kind })); setUploaded([]); setError(''); }} className={`rounded-md border px-3 py-1.5 text-sm ${fields.kind === kind ? 'border-blue-600 bg-blue-50 font-semibold text-blue-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{kind}</button>
                ))}
              </div>
              {kindHint && <p role="status" className="mt-1.5 text-xs leading-5 text-slate-600">{kindHints[kindHint]}</p>}
            </div>
            <div>
              <label htmlFor="quote-demand" className="text-sm font-semibold text-slate-800">需求说明</label>
              <textarea id="quote-demand" name="demand" value={fields.demand} onChange={changeField} rows={3} maxLength={3000} aria-invalid={Boolean(fieldErrors.demand)} aria-describedby={fieldErrors.demand ? 'quote-demand-help quote-demand-error' : 'quote-demand-help'} className={`${inputClass} block resize-y`} placeholder="例如：需要 20 条设备连接线，成品长度 500 mm，用于样机。" />
              {fieldErrors.demand && <p id="quote-demand-error" className={fieldErrorClass}>{fieldErrors.demand}</p>}
            </div>
            <div>
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
                <input ref={filePicker} aria-label="选择图纸" type="file" multiple accept={QUOTE_FILE_ACCEPT} className="hidden" onChange={(event) => { addFiles(event.currentTarget.files); event.currentTarget.value = ''; }} />
                <button ref={addDrawing} type="button" aria-describedby={fileError ? 'quote-file-help quote-file-error' : 'quote-file-help'} onClick={() => filePicker.current?.click()} className={`${buttonClass} border border-slate-300 bg-white text-slate-800 hover:border-blue-600`}><Upload aria-hidden="true" className="h-4 w-4" />添加图纸</button>
                <p id="quote-file-help" className="mt-1.5 text-xs leading-5 text-slate-600">支持选择或拖入 PDF、DWG、DXF、JPG、PNG。最多 {QUOTE_FILE_MAX_COUNT} 份，每份不超过 {QUOTE_FILE_MAX_MIB} MB。</p>
              </div>
              {files.length > 0 && (
                <p className="mt-2 text-xs leading-5 text-slate-600" aria-live="polite">
                  已选 {files.length}/{QUOTE_FILE_MAX_COUNT} 份 · {uploaded.length || busy ? `已上传 ${uploaded.length}/${files.length} 份` : '提交时上传'}
                </p>
              )}
              {files.length > 0 && <ul className="mt-2 divide-y divide-slate-100">
                {files.map((file, index) => <li key={`${file.name}:${file.size}:${file.lastModified}`} className="flex items-center gap-2 py-2 text-sm">
                  <span className="min-w-0 flex-1 break-all text-slate-800">{file.name}</span>
                  <span className="shrink-0 text-xs text-slate-500">{uploaded.includes(index) ? '已上传' : `${Math.max(1, Math.round(file.size / 1024))} KB`}</span>
                  <button type="button" aria-label={`移除 ${file.name}`} title="移除文件" onClick={() => { setFiles(files.filter((_, item) => item !== index)); setUploaded([]); setFileError(''); }} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-700"><X aria-hidden="true" className="h-4 w-4" /></button>
                </li>)}
              </ul>}
              {fileError && <p id="quote-file-error" role="alert" className="mt-2 text-sm text-red-700">{fileError}</p>}
            </div>
          </section>
          <section className="border-t border-slate-200 pt-4" aria-labelledby="quote-contact">
            <h2 id="quote-contact" className="font-semibold text-slate-900">联系方式</h2>
            <p id="quote-contact-help" className="mt-1 text-xs text-slate-600">手机号和邮箱至少填一项。</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:gap-x-4">
              <div>
                <label htmlFor="quote-name" className="text-sm text-slate-800">联系人 <span className="text-red-700">*</span></label>
                <input id="quote-name" name="name" value={fields.name} required maxLength={60} autoComplete="name" onChange={changeField} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? 'quote-name-error' : undefined} className={inputClass} />
                {fieldErrors.name && <p id="quote-name-error" className={fieldErrorClass}>{fieldErrors.name}</p>}
              </div>
              <label className="text-sm text-slate-800">企业名称 <span className="text-slate-500">（选填）</span><input name="company" value={fields.company} maxLength={120} autoComplete="organization" onChange={changeField} className={inputClass} /></label>
              {fieldErrors.contact && <p id="quote-contact-error" className="text-xs leading-5 text-red-700 sm:col-span-2">{fieldErrors.contact}</p>}
              <div>
                <label htmlFor="quote-phone" className="text-sm text-slate-800">手机号</label>
                <input id="quote-phone" name="phone" type="tel" value={fields.phone} maxLength={32} autoComplete="tel" onChange={changeField} aria-invalid={Boolean(fieldErrors.contact || fieldErrors.phone)} aria-describedby={`quote-contact-help${fieldErrors.contact ? ' quote-contact-error' : ''}${fieldErrors.phone ? ' quote-phone-error' : ''}`} className={inputClass} />
                {fieldErrors.phone && <p id="quote-phone-error" className={fieldErrorClass}>{fieldErrors.phone}</p>}
              </div>
              <div>
                <label htmlFor="quote-email" className="text-sm text-slate-800">邮箱</label>
                <input id="quote-email" name="email" type="email" value={fields.email} maxLength={254} autoComplete="email" onChange={changeField} aria-invalid={Boolean(fieldErrors.contact || fieldErrors.email)} aria-describedby={`quote-contact-help${fieldErrors.contact ? ' quote-contact-error' : ''}${fieldErrors.email ? ' quote-email-error' : ''}`} className={inputClass} />
                {fieldErrors.email && <p id="quote-email-error" className={fieldErrorClass}>{fieldErrors.email}</p>}
              </div>
            </div>
          </section>
        </fieldset>
        <div className="space-y-3 rounded-b-xl border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-7">
          <p className="text-xs leading-5 text-slate-600">提交的联系方式和图纸用于本次询价及后续沟通。</p>
          {error && <p role="alert" className="rounded-md bg-red-50 p-2.5 text-sm text-red-800">{error}</p>}
          {progress && <p role="status" className="break-all text-sm text-blue-800">{progress}</p>}
          <button type="submit" disabled={busy} className={`${buttonClass} w-full bg-blue-700 text-white hover:bg-blue-800 sm:w-auto`}>{busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <ArrowRight aria-hidden="true" className="h-4 w-4" />}{error ? '重试提交' : '提交询价'}</button>
        </div>
      </form>
    </div>
  );
}
