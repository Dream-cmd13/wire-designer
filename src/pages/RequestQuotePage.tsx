import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Headphones, Loader2, Upload, X } from 'lucide-react';
import { QuoteSubmissionError, sendQuoteRequest } from '@/lib/quoteRequests';
import {
  hasQuoteFileSignature, QUOTE_FILE_ACCEPT, QUOTE_FILE_MAX_COUNT, QUOTE_KINDS,
  quoteFileHash, validateQuoteFile, validateQuoteRequest,
} from '../../supabase/functions/_shared/quoteRequest';

const emptyFields = { name: '', phone: '', email: '', company: '', demand: '', kind: '' };
const inputClass = 'mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold disabled:opacity-60';

export default function RequestQuotePage() {
  const [fields, setFields] = useState(emptyFields);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [uploaded, setUploaded] = useState<number[]>([]);
  const [receipt, setReceipt] = useState('');
  const [copied, setCopied] = useState(false);
  const submitting = useRef(false);
  const attempt = useRef<{ id: string; fingerprint: string; uploaded: Set<number> } | null>(null);
  const contact = useRef<HTMLInputElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const busy = Boolean(progress);

  function changeField(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = event.currentTarget;
    setFields((current) => ({ ...current, [name]: value }));
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
    submitting.current = true;
    setError('');
    setProgress('正在检查资料…');
    try {
      validateQuoteRequest({ ...fields, files: files.map((file) => ({ name: file.name, size: file.size, sha256: '0'.repeat(64) })) });
      const attachments = [];
      for (const file of files) {
        const bytes = await file.arrayBuffer();
        if (!hasQuoteFileSignature(file.name, new Uint8Array(bytes))) throw new Error(`「${file.name}」的内容与文件格式不符，请重新选择。`);
        attachments.push({ name: file.name, size: file.size, sha256: await quoteFileHash(bytes) });
      }
      const input = validateQuoteRequest({ ...fields, files: attachments });
      const fingerprint = JSON.stringify(input);
      if (attempt.current?.fingerprint !== fingerprint) {
        attempt.current = { id: crypto.randomUUID(), fingerprint, uploaded: new Set() };
        setUploaded([]);
      }
      const active = attempt.current;
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
    <div className="mx-auto max-w-3xl px-3 py-5 sm:px-6 sm:py-9">
      <p className="mb-5 text-sm leading-6 text-slate-600">告诉我们您需要的线束，或直接上传图纸。专员会与您确认需求并提供报价。无需登录。</p>
      <form onSubmit={(event) => void submit(event)} className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <fieldset disabled={busy} className="min-w-0 space-y-6 px-4 py-5 sm:px-7 sm:py-6">
          <section className="space-y-4" aria-label="需求和图纸">
            <div className="flex flex-wrap gap-2" role="group" aria-label="需求类型（选填）">
              {QUOTE_KINDS.map((kind) => (
                <button key={kind} type="button" aria-pressed={fields.kind === kind} onClick={() => setFields((previous) => ({ ...previous, kind: previous.kind === kind ? '' : kind }))} className={`rounded-md border px-3 py-1.5 text-sm ${fields.kind === kind ? 'border-blue-600 bg-blue-50 font-semibold text-blue-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{kind}</button>
              ))}
            </div>
            <label className="block text-sm font-semibold text-slate-800">
              需求说明
              <textarea name="demand" value={fields.demand} onChange={changeField} rows={5} maxLength={3000} className={`${inputClass} min-h-28 resize-y font-normal`} placeholder="例如：需要 20 条设备连接线，成品长度 500 mm，用于样机。接头型号、线序或交期如已确定，也可写在这里。" />
            </label>
            <div>
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
                <input ref={filePicker} aria-label="选择图纸" type="file" multiple accept={QUOTE_FILE_ACCEPT} className="hidden" onChange={(event) => { addFiles(event.currentTarget.files); event.currentTarget.value = ''; }} />
                <button type="button" onClick={() => filePicker.current?.click()} className={`${buttonClass} border border-slate-300 bg-white text-slate-800 hover:border-blue-600`}><Upload aria-hidden="true" className="h-4 w-4" />上传图纸</button>
                <p className="mt-2 text-xs leading-5 text-slate-600">可拖入 PDF、DWG、DXF、JPG、PNG。最多 5 份，每份不超过 5 MB。填写文字或上传图纸均可提交。</p>
              </div>
              {files.length > 0 && <ul className="mt-2 divide-y divide-slate-100">
                {files.map((file, index) => <li key={`${file.name}:${file.size}:${file.lastModified}`} className="flex items-center gap-2 py-2 text-sm">
                  <span className="min-w-0 flex-1 break-all text-slate-800">{file.name}</span>
                  <span className="shrink-0 text-xs text-slate-500">{uploaded.includes(index) ? '已上传' : `${Math.max(1, Math.round(file.size / 1024))} KB`}</span>
                  <button type="button" aria-label={`移除 ${file.name}`} title="移除文件" onClick={() => { setFiles(files.filter((_, item) => item !== index)); setUploaded([]); setFileError(''); }} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-700"><X aria-hidden="true" className="h-4 w-4" /></button>
                </li>)}
              </ul>}
              {fileError && <p role="alert" className="mt-2 text-sm text-red-700">{fileError}</p>}
            </div>
          </section>
          <section className="border-t border-slate-200 pt-5" aria-labelledby="quote-contact">
            <h2 id="quote-contact" className="font-semibold text-slate-900">联系方式</h2>
            <p className="mt-1 text-xs text-slate-600">手机号和邮箱至少填一项。</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-800">联系人 <span className="text-red-700">*</span><input ref={contact} name="name" value={fields.name} required maxLength={60} autoComplete="name" onChange={changeField} className={inputClass} /></label>
              <label className="text-sm text-slate-800">企业名称 <span className="text-slate-500">（选填）</span><input name="company" value={fields.company} maxLength={120} autoComplete="organization" onChange={changeField} className={inputClass} /></label>
              <label className="text-sm text-slate-800">手机号<input name="phone" type="tel" value={fields.phone} maxLength={32} autoComplete="tel" onChange={changeField} className={inputClass} /></label>
              <label className="text-sm text-slate-800">邮箱<input name="email" type="email" value={fields.email} maxLength={254} autoComplete="email" onChange={changeField} className={inputClass} /></label>
            </div>
          </section>
        </fieldset>
        <div className="space-y-3 rounded-b-xl border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-7">
          <p className="text-xs leading-5 text-slate-600">提交的联系方式和图纸用于本次询价及后续沟通。</p>
          {error && <p role="alert" className="rounded-md bg-red-50 p-2.5 text-sm text-red-800">{error}</p>}
          {progress && <p role="status" className="break-all text-sm text-blue-800">{progress}</p>}
          <div className="flex flex-wrap gap-2.5">
            <button type="submit" disabled={busy} className={`${buttonClass} bg-blue-700 text-white hover:bg-blue-800`}>{busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <ArrowRight aria-hidden="true" className="h-4 w-4" />}{error ? '重试提交' : '提交询价'}</button>
            <button type="button" disabled={busy} onClick={() => contact.current?.focus()} className={`${buttonClass} border border-slate-300 bg-white text-slate-700 hover:bg-slate-100`}><Headphones aria-hidden="true" className="h-4 w-4" />请专员联系我</button>
          </div>
        </div>
      </form>
    </div>
  );
}
