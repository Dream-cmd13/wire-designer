import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Upload, CloudUpload, RefreshCw } from 'lucide-react';
import { ModelViewer } from '@/components/models/ModelViewer';
import { parseModel, validateModelFile } from '@/lib/models/modelParser';
import { type ModelFormat, type ModelQuality, type ParsedModel, type ParsePhase, type StlUnit } from '@/lib/models/modelTypes';
import { buildModelViewerRoutePath, getModelIdFromSearch } from '@/lib/appRoute';
import { createModelSaveSession, modelRepository, type ModelAsset, type SavePhase } from '@/repositories/modelRepository';
import { useUserStore } from '@/stores/userStore';

type Preview = 'idle' | ParsePhase | 'ready' | 'error' | 'downloading';
type SaveState = 'local' | SavePhase | 'saved' | 'error';
const phases: Record<Preview, string> = { idle: '尚未选择文件', reading: '正在读取文件…', engine: '正在加载 STEP 解析引擎…', parsing: '正在解析模型…', ready: '预览就绪', error: '预览失败', downloading: '正在下载私有模型…' };
const saves: Record<SaveState, string> = { local: '仅本地预览', uploading: '保存中：正在上传原文件…', finalizing: '原文件已上传，正在写入数据库确认…', saved: '已保存', error: '保存失败，可重试' };
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';
function errorMessage(error: unknown) { return error instanceof Error ? error.message : '操作失败，请检查网络后重试。'; }
function isAbort(error: unknown) { return error instanceof Error && error.name === 'AbortError'; }
function setModelUrl(id: string | null) { window.history.replaceState(null, '', buildModelViewerRoutePath('/model-viewer', id)); }

export function ModelViewerPage() {
  const user = useUserStore((state) => state.currentUser);
  if (!user || !['engineer','admin'].includes(user.role ?? '')) return <div className="p-8">请使用工程师或管理员账号登录。</div>;
  return <ModelWorkspace key={`${user.id}:${user.role}`} ownerId={user.id} />;
}

function ModelWorkspace({ ownerId }: { ownerId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<ModelFormat>('step');
  const [unit, setUnit] = useState<StlUnit>('mm');
  const [model, setModel] = useState<ParsedModel | null>(null);
  const [preview, setPreview] = useState<Preview>('idle');
  const [save, setSave] = useState<SaveState>('local');
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<ModelAsset[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listPage, setListPage] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [recovering, setRecovering] = useState<ModelAsset | null>(null);
  const [modelKey, setModelKey] = useState<string | null>(null);
  const [requestedQuality, setRequestedQuality] = useState<ModelQuality>('standard');
  const [appliedQuality, setAppliedQuality] = useState<ModelQuality>('standard');
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityError, setQualityError] = useState<string | null>(null);
  const [listExpanded, setListExpanded] = useState(true);
  const qualityBusy = useRef(false);
  const task = useRef<{ version: number; controller: AbortController }>({ version: 0, controller: new AbortController() });
  const listTask = useRef<AbortController | null>(null);
  const saveSession = useRef<ModelAsset | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const saving = save === 'uploading' || save === 'finalizing';
  const loading = ['reading','engine','parsing','downloading'].includes(preview);

  const begin = useCallback(() => {
    task.current.controller.abort();
    qualityBusy.current = false;
    const next = { version: task.current.version + 1, controller: new AbortController() };
    task.current = next;
    return next;
  }, []);
  const refresh = useCallback(async (page = 0) => {
    listTask.current?.abort();
    if (!modelRepository.configured) return;
    const controller = new AbortController(); listTask.current = controller;
    setListLoading(true); setListError(null);
    try {
      const rows = await modelRepository.list(ownerId, controller.signal, page);
      if (!controller.signal.aborted && mounted.current) { setRecords(rows); setListPage(page); }
    } catch (cause) { if (!controller.signal.aborted && mounted.current) setListError(errorMessage(cause)); }
    finally { if (!controller.signal.aborted && mounted.current) setListLoading(false); }
  }, [ownerId]);
  const parse = useCallback(async (source: File, sourceUnit: StlUnit, current: typeof task.current) => {
    const active = () => mounted.current && current === task.current && !current.controller.signal.aborted;
    try {
      const kind = validateModelFile(source);
      if (!active()) return;
      setFile(source); setFormat(kind); setUnit(sourceUnit); setModel(null); setPreview('reading'); setError(null);
      setModelKey(String(current.version)); setRequestedQuality('standard'); setAppliedQuality('standard'); setQualityLoading(false); setQualityError(null);
      const result = await parseModel(source, { format: kind, stlUnit: sourceUnit, quality: 'standard', signal: current.controller.signal,
        onPhase: (phase) => { if (active()) setPreview(phase); } });
      if (!active()) return;
      setModel(result); setPreview('ready');
    } catch (cause) {
      if (!active() || isAbort(cause)) return;
      setPreview('error'); setError(errorMessage(cause));
    }
  }, []);
  const openCloud = useCallback(async (id: string) => {
    if (busy.current) return;
    const current = begin();
    const active = () => mounted.current && current === task.current && !current.controller.signal.aborted;
    saveSession.current = null; setRecovering(null); setFile(null); setModel(null); setPreview('downloading'); setSave('local'); setError(null);
    setQualityLoading(false); setQualityError(null);
    try {
      const asset = await modelRepository.get(id, current.controller.signal);
      if (!active()) return;
      if (!asset || asset.owner_id !== ownerId) throw new Error('模型不存在或无访问权限，请从本人列表重新选择。');
      // Persistence is independent of downloading or parsing the display mesh.
      saveSession.current = asset;
      if (asset.status === 'uploading') {
        setRecovering(asset); setPreview('idle'); setSave('error');
        setError('此模型保存未完成，请点击恢复保存；若原文件尚未上传，将要求重新选择。'); return;
      }
      setSave('saved');
      const source = await modelRepository.download(asset, current.controller.signal);
      if (active()) await parse(source, asset.source_unit, current);
    } catch (cause) { if (active() && !isAbort(cause)) { setPreview('error'); setError(errorMessage(cause)); } }
  }, [begin, ownerId, parse]);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const fromLocation = () => {
      // Browser history can change during a save. Cancel callbacks; never infer a server rollback.
      busy.current = false;
      const id = getModelIdFromSearch(window.location.search);
      if (id) void openCloud(id);
      else { begin(); saveSession.current = null; setFile(null); setModel(null); setRecovering(null); setPreview('idle'); setSave('local'); setError(null); setQualityLoading(false); setQualityError(null); }
    };
    queueMicrotask(() => { if (!controller.signal.aborted) { void refresh(); if (getModelIdFromSearch(window.location.search)) fromLocation(); } });
    window.addEventListener('popstate', fromLocation);
    return () => { controller.abort(); mounted.current = false; task.current.controller.abort(); listTask.current?.abort(); window.removeEventListener('popstate', fromLocation); };
  }, [begin, openCloud, refresh]);

  const choose = (files: FileList | File[]) => {
    if (busy.current) return;
    if (files.length !== 1) { if (files.length > 1) setError('一次请选择一个模型文件'); return; }
    const source = files[0];
    try { validateModelFile(source); } catch (cause) { setError(errorMessage(cause)); return; }
    const recovery = recovering;
    const nextUnit = recovery?.source_unit ?? 'mm';
    const current = begin();
    saveSession.current = recovery;
    setSave('local'); setModelUrl(null);
    void parse(source, nextUnit, current);
  };
  const changeQuality = async (quality: ModelQuality) => {
    if (busy.current || !file || !model || format !== 'step' || loading) return;
    const current = begin();
    setQualityError(null); setRequestedQuality(quality);
    if (quality === appliedQuality) { setQualityLoading(false); return; }
    qualityBusy.current = true; setQualityLoading(true);
    const active = () => mounted.current && current === task.current && !current.controller.signal.aborted;
    try {
      const result = await parseModel(file, { format, stlUnit: unit, quality, signal: current.controller.signal });
      if (!active()) return;
      setModel(result); setAppliedQuality(quality);
    } catch (cause) {
      if (!active()) return;
      setRequestedQuality(appliedQuality);
      if (!isAbort(cause)) setQualityError(`显示质量生成失败，保留原预览：${errorMessage(cause)}`);
    } finally { if (active()) { qualityBusy.current = false; setQualityLoading(false); } }
  };
  const cancelQuality = () => { begin(); setQualityLoading(false); setRequestedQuality(appliedQuality); setQualityError('已取消显示质量生成，保留原预览。'); };
  const saveCurrent = async (recovery?: ModelAsset, source: File | null = file) => {
    if (busy.current || qualityBusy.current || loading || (!recovery && (!file || !model))) return;
    busy.current = true; setSave('uploading'); setError(null);
    const current = task.current;
    const active = () => mounted.current && current === task.current && !current.controller.signal.aborted;
    try {
      if (recovery) saveSession.current = recovery;
      if (!saveSession.current) {
        const session = await createModelSaveSession(ownerId, source!, unit, model!);
        if (!active()) return;
        saveSession.current = session;
      }
      if (!active()) return;
      const asset = await modelRepository.save(saveSession.current, source ?? undefined, current.controller.signal, (phase) => { if (active()) setSave(phase); });
      if (!active()) return;
      saveSession.current = asset; setRecovering(null); setSave('saved'); setModelUrl(asset.id); void refresh();
      if (!model || (recovery && !source)) { busy.current = false; void openCloud(asset.id); }
    } catch (cause) { if (active() && !isAbort(cause)) { setSave('error'); setError(errorMessage(cause)); } }
    finally { if (current === task.current) busy.current = false; }
  };
  const cancel = () => { begin(); setPreview('idle'); setError('已取消，可重新选择文件。'); };

  return <div className="flex h-full flex-col gap-3 overflow-auto bg-slate-50 p-3 lg:p-4">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Box size={18} className="text-blue-600" />3D 模型</h2>
      <div className="flex gap-2"><button className={buttonClass} disabled={saving} onClick={() => fileInput.current?.click()}><Upload size={16} />选择文件</button>
        <button className={`${buttonClass} !bg-blue-600 text-white hover:!bg-blue-700`} disabled={saving || loading || qualityLoading || save === 'saved' || (!model && !recovering) || !modelRepository.configured} onClick={() => void saveCurrent(recovering ?? undefined)}>
          <CloudUpload size={16} />{save === 'error' ? '重试保存' : '保存到云端'}</button>
        <button className={buttonClass} aria-expanded={listExpanded} onClick={() => setListExpanded(!listExpanded)}>{listExpanded ? '收起云端模型' : '展开云端模型'}</button></div>
    </header>
    <input ref={fileInput} type="file" className="sr-only" aria-label="选择模型文件" accept=".step,.stp,.stl" disabled={saving} onChange={(event) => { if (event.target.files) choose(event.target.files); event.target.value = ''; }} />
    {!modelRepository.configured && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">云端尚未配置，可继续本地预览，暂时无法保存。</p>}
    {recovering && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
      <span>正在恢复：{recovering.original_name}。重新选择的原文件将校验大小和 SHA-256。</span>
      <button className={buttonClass} disabled={saving} onClick={() => { saveSession.current = null; setRecovering(null); setSave('local'); setError(null); setModelUrl(null); }}>结束恢复，预览新模型</button>
    </div>}
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className={`grid min-h-[520px] flex-1 grid-cols-1 gap-3 ${listExpanded ? 'xl:grid-cols-[minmax(0,1fr)_260px]' : ''}`}>
      <section data-testid="model-drop-zone" className="flex min-h-[500px] min-w-0 flex-col gap-3" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files); }}>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-3 text-sm">
          <span className="min-w-0 truncate font-medium" title={file?.name}>{file?.name ?? '选择或拖入一个 STEP / STP / STL 文件'}</span>
          {file && <span className="text-slate-500">{format.toUpperCase()} · {(file.size / 1024).toFixed(1)} KiB</span>}
          {file && format === 'step' && <label className="flex items-center gap-2">显示质量
            <select aria-label="显示质量" className="rounded border p-1" value={requestedQuality} disabled={saving || loading || !model} onChange={(event) => void changeQuality(event.target.value as ModelQuality)}>
              <option value="standard">标准</option><option value="fine">精细</option>
            </select></label>}
          {file && format === 'stl' && <label className="flex items-center gap-2">用户指定单位
            <select className="rounded border p-1" aria-label="STL 用户指定单位" value={unit} disabled={saving || Boolean(recovering)} onChange={(event) => {
              const next = event.target.value as StlUnit; const current = begin(); saveSession.current = null; setSave('local'); setUnit(next); setModelUrl(null); void parse(file, next, current);
            }}><option value="mm">毫米</option><option value="cm">厘米</option><option value="m">米</option><option value="inch">英寸</option></select></label>}
          <span className="ml-auto text-slate-500" role="status">{phases[preview]}</span>
          {loading && <button className="text-blue-600" onClick={cancel}>取消加载</button>}
          {preview === 'error' && file && <button className="text-blue-600" onClick={() => void parse(file, unit, begin())}>重试解析</button>}
        </div>
        {qualityError && <p role="alert" className="text-sm text-amber-800">{qualityError}</p>}
        <ModelViewer model={model} modelKey={modelKey} status={<><span className="max-w-64 truncate" title={file?.name}>{file?.name}</span><span>{saves[save]}</span>{qualityLoading && <><span>正在生成{requestedQuality === 'fine' ? '精细' : '标准'}预览…</span><button onClick={cancelQuality}>取消质量生成</button></>}{model && <span>{model.boundsMm.max.map((value, i) => (value - model.boundsMm.min[i]).toFixed(2)).join(' × ')} mm（网格近似）</span>}</>} />
        {model && <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
          <span>包围盒尺寸（网格近似）</span>
          <span data-testid="model-bounds">{model.boundsMm.max.map((value, i) => (value - model.boundsMm.min[i]).toFixed(2)).join(' × ')} mm</span>
          {format === 'step' && <span>{appliedQuality === 'fine' ? '精细' : '标准'}已生效</span>}
          <details className="w-full"><summary className="cursor-pointer">模型详情</summary>
            <p>{model.triangleCount.toLocaleString()} 个三角形 · {model.meshes.length} 个网格</p>
            <p>{format === 'step' ? 'STEP 输出单位：毫米' : `STL 单位由用户指定（${unit}），显示已换算为毫米`}</p>
            <p>原文件仅在主动保存时上传，上限 20 MiB。文件解析最长 60 秒，返回后最多接受 1,000,000 个三角形。</p>
            <p>显示质量不改变原文件精度。曲面边界为模型网格派生线，仅供查看，可能包含接缝；不代表精确 CAD 拓扑边。</p>
            <p>{format === 'stl' ? 'STL 使用原始网格，不支持曲面边界及质量细化。' : model.surfaceEdgeWarning}</p>
          </details>
        </div>}
        {model?.surfaceEdgeWarning && <p className="text-xs text-amber-800">{model.surfaceEdgeWarning}</p>}
      </section>
      <aside hidden={!listExpanded} className={listExpanded ? 'flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-3' : 'hidden'}>
        <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">本人云端模型</h3><button className="text-slate-500 disabled:opacity-40" aria-label="刷新模型列表" disabled={saving || listLoading || !modelRepository.configured} onClick={() => void refresh(listPage)}><RefreshCw size={16} /></button></div>
        {listError && <p className="mb-3 text-xs text-red-600">{listError}</p>}
        {listLoading && <p className="text-xs text-slate-500">正在读取列表…</p>}
        {!listLoading && !records.length && <p className="text-xs text-slate-400">暂无模型。保存后可在此重新打开。</p>}
        <ul className="min-h-0 flex-1 space-y-2">{records.map((asset) => <li key={asset.id} className="rounded-lg border border-slate-200 p-3">
          <p className="truncate text-sm" title={asset.original_name}>{asset.original_name}</p>
          <p className="mt-1 text-xs text-slate-500">{asset.format.toUpperCase()} · {asset.status === 'ready' ? '已保存' : '保存未完成'}</p>
          <button className="mt-2 text-xs text-blue-600 disabled:opacity-40" disabled={saving || ((loading || qualityLoading) && asset.status !== 'ready')} onClick={() => { if (asset.status === 'ready') { setModelUrl(asset.id); void openCloud(asset.id); } else {
            begin(); saveSession.current = asset; setRecovering(asset); setFile(null); setModel(null); setPreview('idle'); setQualityLoading(false); void saveCurrent(asset, null);
          } }}>{asset.status === 'ready' ? '打开预览' : '恢复保存'}</button>
        </li>)}</ul>
        <div className="mt-3 flex justify-between text-xs"><button disabled={listPage === 0 || saving || listLoading} className="disabled:opacity-30" onClick={() => void refresh(listPage - 1)}>上一页</button><span>第 {listPage + 1} 页</span><button disabled={records.length < 20 || saving || listLoading} className="disabled:opacity-30" onClick={() => void refresh(listPage + 1)}>下一页</button></div>
      </aside>
    </div>
  </div>;
}
