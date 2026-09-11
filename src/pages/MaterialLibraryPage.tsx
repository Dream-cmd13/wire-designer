import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Cable,
  Check,
  Database,
  Download,
  FileSpreadsheet,
  Layers,
  Plug,
  Search,
  Upload,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePriceStore } from '@/stores/priceStore';
import {
  getCatalogConnectors,
  getCatalogWires,
  getCatalogOvermolds,
  getCatalogProtectionOptions,
  getCatalogSnapshot,
} from '@/lib/catalogRuntime';
import { createPriceTemplate, parsePriceWorkbook } from '@/lib/priceImport';
import {
  getCatalogPriceCandidates,
  buildCatalogPriceTemplateRows,
  materialPriceTierKey,
} from '@/lib/quoteMaterials';
import { applyCatalogWireSpec } from '@/lib/wireCatalog';
import type { MaterialPrice } from '@/repositories/priceRepository';
import type { Connector, OvermoldSpec } from '@/types/harness';
import type { CatalogWire } from '@/types/catalog';

type MaterialTab = 'connectors' | 'wires' | 'accessories';

const BASE_WIRE_SPEC = {
  kind: 'electronic' as const,
  awg: 24,
  color: '黑色',
  ulNumber: '1007' as const,
  lengthMm: 1000,
  endTreatment: {
    start: { stripped: false, termination: 'none' as const },
    end: { stripped: false, termination: 'none' as const },
  },
};

function formatWireTierLength(lengthMm: number): string {
  if (!Number.isFinite(lengthMm) || lengthMm <= 0) return '-';
  if (lengthMm >= 1000) {
    const m = lengthMm / 1000;
    return `${Number(m.toFixed(2))}m`;
  }
  if (lengthMm % 100 === 0) {
    return `${Number((lengthMm / 1000).toFixed(2))}m`;
  }
  return `${lengthMm}mm`;
}

export function MaterialLibraryPage({
  initialTab = 'connectors',
}: {
  initialTab?: MaterialTab;
} = {}) {
  const storeSnapshot = useCatalogStore((state) => state.snapshot);
  const snapshot = storeSnapshot ?? getCatalogSnapshot();
  const connectors = useMemo(() => getCatalogConnectors(snapshot), [snapshot]);
  const wires = useMemo(() => getCatalogWires(snapshot), [snapshot]);
  const overmolds = useMemo(() => getCatalogOvermolds(snapshot), [snapshot]);
  const protectionOptions = useMemo(() => getCatalogProtectionOptions(snapshot), [snapshot]);

  const { book: storeBook, loading, error, load, merge } = usePriceStore();
  const book = storeBook ?? usePriceStore.getState().book;
  const prices = useMemo(() => book?.prices ?? [], [book]);

  const [activeTab, setActiveTab] = useState<MaterialTab>(initialTab);

  // 连接器筛选
  const [connQuery, setConnQuery] = useState('');
  const [connManufacturer, setConnManufacturer] = useState('all');
  const [connSeries, setConnSeries] = useState('all');
  const [connShielded, setConnShielded] = useState('all');
  const [connType, setConnType] = useState('all');
  const [connPinCount, setConnPinCount] = useState('all');
  const [connPriceStatus, setConnPriceStatus] = useState<'all' | 'priced' | 'unpriced'>('all');

  // 线缆筛选
  const [wireQuery, setWireQuery] = useState('');
  const [wireKind, setWireKind] = useState('all');
  const [wireAwg, setWireAwg] = useState('all');
  const [wireShielded, setWireShielded] = useState('all');
  const [wirePriceStatus, setWirePriceStatus] = useState<'all' | 'priced' | 'unpriced'>('all');

  // 辅材筛选
  const [accQuery, setAccQuery] = useState('');

  // 价格导入/导出状态
  const [pendingImport, setPendingImport] = useState<{
    name: string;
    prices: MaterialPrice[];
  } | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; isError?: boolean } | null>(
    null,
  );
  const [readingFile, setReadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 自动加载最新价格库
  useEffect(() => {
    void load();
  }, [load]);

  // 精准价格索引映射
  const priceIndex = useMemo(() => {
    const connMap = new Map<string, MaterialPrice>();
    const moldMap = new Map<string, MaterialPrice>();
    const wireTiersMap = new Map<string, MaterialPrice[]>();

    for (const p of prices) {
      const tierKey = materialPriceTierKey(p);
      if (p.kind === 'connector') {
        connMap.set(tierKey, p);
      } else if (p.kind === 'outer-mold') {
        moldMap.set(tierKey, p);
      } else if (p.kind === 'wire') {
        const list = wireTiersMap.get(tierKey) ?? [];
        list.push(p);
        wireTiersMap.set(tierKey, list);
      }
    }

    for (const list of wireTiersMap.values()) {
      list.sort((a, b) => a.lengthMm - b.lengthMm);
    }

    return { connMap, moldMap, wireTiersMap };
  }, [prices]);

  // 获取连接器价格（严格精确匹配）
  const getConnectorPrice = useCallback(
    (c: Connector): MaterialPrice | undefined => {
      const resId = c.resourceItemId || c.id;
      const spec = JSON.stringify([c.model || '', c.series || '', c.pinCount, c.type]);
      const tierKey = JSON.stringify(['connector', resId, spec, '元/个']);
      return priceIndex.connMap.get(tierKey);
    },
    [priceIndex.connMap],
  );

  // 获取线缆全部长度价格档位（严格精确匹配）
  const getWirePrices = useCallback(
    (w: CatalogWire): MaterialPrice[] => {
      const resId = w.resourceItemId || w.id;
      const s = applyCatalogWireSpec(BASE_WIRE_SPEC, w.spec);
      const specification =
        s.kind === 'jacketed'
          ? [
              s.kind,
              s.awg ?? null,
              s.coreCount,
              s.shielded,
              s.jacketMaterial,
              s.jacketColor,
              s.odMm,
              s.ulNumber || '',
              s.coreColors,
              ...(s.conductorAreaMm2 === undefined ? [] : [s.conductorAreaMm2]),
            ]
          : [s.kind, s.awg, s.color, s.ulNumber];
      const tierKey = JSON.stringify(['wire', resId, JSON.stringify(specification), '元/条']);
      return priceIndex.wireTiersMap.get(tierKey) ?? [];
    },
    [priceIndex.wireTiersMap],
  );

  // 获取外模价格（严格精确匹配）
  const getOvermoldPrice = useCallback(
    (m: OvermoldSpec): MaterialPrice | undefined => {
      const resId = m.resourceItemId || m.id;
      const spec = JSON.stringify([m.outerMaterial, m.outerHardness || '', m.outerForm]);
      const tierKey = JSON.stringify(['outer-mold', resId, spec, '元/个']);
      return priceIndex.moldMap.get(tierKey);
    },
    [priceIndex.moldMap],
  );

  // 连接器筛选选项
  const connManufacturers = useMemo(
    () => Array.from(new Set(connectors.map((c) => c.manufacturer))).filter(Boolean).sort(),
    [connectors],
  );
  const connAllSeries = useMemo(
    () => Array.from(new Set(connectors.map((c) => c.series).filter(Boolean))).sort() as string[],
    [connectors],
  );
  const connPinCounts = useMemo(
    () => Array.from(new Set(connectors.map((c) => c.pinCount))).sort((a, b) => a - b),
    [connectors],
  );

  // 过滤后的连接器
  const filteredConnectors = useMemo(() => {
    const q = connQuery.trim().toLowerCase();
    return connectors.filter((c) => {
      const matchQ =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.model?.toLowerCase().includes(q) ||
        c.series?.toLowerCase().includes(q) ||
        c.manufacturer.toLowerCase().includes(q);

      const matchM = connManufacturer === 'all' || c.manufacturer === connManufacturer;
      const matchS = connSeries === 'all' || c.series === connSeries;
      const matchSh =
        connShielded === 'all' ||
        (connShielded === 'shielded' && c.shielded === true) ||
        (connShielded === 'unshielded' && c.shielded === false);
      const matchT = connType === 'all' || c.type === connType;
      const matchP = connPinCount === 'all' || c.pinCount === Number(connPinCount);

      const hasPrice = Boolean(getConnectorPrice(c));
      const matchPr =
        connPriceStatus === 'all' ||
        (connPriceStatus === 'priced' && hasPrice) ||
        (connPriceStatus === 'unpriced' && !hasPrice);

      return matchQ && matchM && matchS && matchSh && matchT && matchP && matchPr;
    });
  }, [
    connectors,
    connQuery,
    connManufacturer,
    connSeries,
    connShielded,
    connType,
    connPinCount,
    connPriceStatus,
    getConnectorPrice,
  ]);

  // 线缆筛选选项
  const wireAwgs = useMemo(() => {
    const set = new Set<number>();
    for (const w of wires) {
      if (w.spec.awg != null) set.add(w.spec.awg);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [wires]);

  // 过滤后的线缆
  const filteredWires = useMemo(() => {
    const q = wireQuery.trim().toLowerCase();
    return wires.filter((w) => {
      const matchQ =
        !q ||
        w.name.toLowerCase().includes(q) ||
        w.id.toLowerCase().includes(q) ||
        w.model?.toLowerCase().includes(q) ||
        w.manufacturer?.toLowerCase().includes(q) ||
        (w.spec.ulNumber ? String(w.spec.ulNumber).toLowerCase().includes(q) : false) ||
        (w.spec.awg != null &&
          (String(w.spec.awg).includes(q) ||
            `${w.spec.awg}awg`.includes(q) ||
            `${w.spec.awg} awg`.includes(q)));

      const matchK =
        wireKind === 'all' ||
        (wireKind === 'electronic' && w.spec.kind === 'electronic') ||
        (wireKind === 'jacketed' && w.spec.kind === 'jacketed');

      const matchA = wireAwg === 'all' || w.spec.awg === Number(wireAwg);

      const isShielded = w.spec.kind === 'jacketed' && Boolean(w.spec.shielded);
      const matchSh =
        wireShielded === 'all' ||
        (wireShielded === 'shielded' && isShielded) ||
        (wireShielded === 'unshielded' && !isShielded);

      const hasPrice = getWirePrices(w).length > 0;
      const matchPr =
        wirePriceStatus === 'all' ||
        (wirePriceStatus === 'priced' && hasPrice) ||
        (wirePriceStatus === 'unpriced' && !hasPrice);

      return matchQ && matchK && matchA && matchSh && matchPr;
    });
  }, [wires, wireQuery, wireKind, wireAwg, wireShielded, wirePriceStatus, getWirePrices]);

  // 辅材过滤
  const filteredOvermolds = useMemo(() => {
    const q = accQuery.trim().toLowerCase();
    if (!q) return overmolds;
    return overmolds.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.outerMaterial.toLowerCase().includes(q),
    );
  }, [overmolds, accQuery]);

  const filteredProtections = useMemo(() => {
    const q = accQuery.trim().toLowerCase();
    if (!q) return protectionOptions;
    return protectionOptions.filter(
      (p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    );
  }, [protectionOptions, accQuery]);

  // 导出价格模板（包含全量 catalog 物料以支持批量补价，并检查读取错误状态）
  const handleExportPrices = async () => {
    setFeedbackMessage(null);
    try {
      await load();
      const latest = usePriceStore.getState();
      if (latest.error) {
        setFeedbackMessage({
          text: `加载共享价格失败：${latest.error}，无法导出价格表`,
          isError: true,
        });
        return;
      }

      const shared = latest.book?.prices ?? [];
      const templateRows = buildCatalogPriceTemplateRows(snapshot, shared);

      if (!templateRows.length) {
        throw new Error('物料目录尚未加载，暂时无法生成价格模板');
      }

      XLSX.writeFile(
        createPriceTemplate(templateRows, shared),
        shared.length ? '物料采购价格表.xlsx' : '物料价格模板.xlsx',
      );
      setFeedbackMessage({
        text: `已成功导出 ${templateRows.length} 项物料价格数据（包含未定价物料以供补价）`,
      });
    } catch (cause) {
      setFeedbackMessage({
        text: cause instanceof Error ? cause.message : '导出价格失败',
        isError: true,
      });
    }
  };

  // 触发文件选择（使用 catalog 级 candidates 匹配，不依赖当前画布工程）
  const handleSelectFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setReadingFile(true);
    setFeedbackMessage(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const candidates = getCatalogPriceCandidates(snapshot);
        const parsed = parsePriceWorkbook(buffer, candidates);
        setPendingImport({ name: file.name, prices: parsed });
      } catch (cause) {
        setFeedbackMessage({
          text: cause instanceof Error ? cause.message : '解析文件失败，请确保格式与模板一致',
          isError: true,
        });
      } finally {
        setReadingFile(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      setReadingFile(false);
      setFeedbackMessage({ text: '读取文件异常', isError: true });
    };
    reader.readAsArrayBuffer(file);
  };

  // 确认导入价格
  const handleConfirmMerge = async () => {
    if (!pendingImport) return;
    try {
      await merge(pendingImport.prices, pendingImport.name);
      setPendingImport(null);
      setFeedbackMessage({ text: `成功导入并更新了 ${pendingImport.prices.length} 项物料价格` });
    } catch (cause) {
      setFeedbackMessage({
        text: cause instanceof Error ? cause.message : '保存至共享价格库失败',
        isError: true,
      });
    }
  };

  const totalItemCount =
    connectors.length + wires.length + overmolds.length + protectionOptions.length;

  return (
    <div className="h-full overflow-y-auto bg-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 lg:p-5 pb-12">
        {/* 顶部标题与操作卡片 */}
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-bold text-slate-900">物料库</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                标准元器件工程规格与采购价格总览，支持多品类规格检索与价格联动管理。
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden sm:inline rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                总物料: <strong className="font-semibold text-slate-800">{totalItemCount}</strong> 项
              </span>
              <button
                type="button"
                disabled={loading || readingFile}
                onClick={handleExportPrices}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50"
                title="导出包含全量物料及已有价格的 Excel 模板"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                导出价格表
              </button>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-blue-700 disabled:opacity-50">
                <Upload className="h-3.5 w-3.5" />
                <span>{readingFile ? '正在解析...' : '导入价格表'}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  disabled={readingFile || loading}
                  onChange={handleSelectFile}
                />
              </label>
            </div>
          </div>

          {/* 操作提示与状态反馈 */}
          {(feedbackMessage || error) && (
            <div
              className={`mt-3 flex items-center justify-between rounded-md px-3 py-2 text-xs ${
                feedbackMessage?.isError || error
                  ? 'border border-red-200 bg-red-50 text-red-700'
                  : 'border border-emerald-200 bg-emerald-50 text-emerald-800'
              }`}
            >
              <span>{feedbackMessage?.text || error}</span>
              <button
                type="button"
                onClick={() => setFeedbackMessage(null)}
                className="cursor-pointer text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* 价格导入待确认浮层 */}
          {pendingImport && (
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                  <span className="font-semibold">
                    准备导入: {pendingImport.name}（共解析出 {pendingImport.prices.length} 项有效价格）
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleConfirmMerge}
                    className="inline-flex cursor-pointer items-center gap-1 rounded bg-blue-600 px-3 py-1 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    确认写入共享价格库
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => setPendingImport(null)}
                    className="cursor-pointer rounded border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 分类 Tabs */}
          <div className="mt-4 flex border-b border-slate-200 text-sm">
            <button
              type="button"
              onClick={() => setActiveTab('connectors')}
              className={`inline-flex cursor-pointer items-center gap-2 border-b-2 px-4 py-2.5 font-medium transition-colors ${
                activeTab === 'connectors'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              <Plug className="h-4 w-4" />
              <span>连接器</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {connectors.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('wires')}
              className={`inline-flex cursor-pointer items-center gap-2 border-b-2 px-4 py-2.5 font-medium transition-colors ${
                activeTab === 'wires'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              <Cable className="h-4 w-4" />
              <span>线材</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {wires.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('accessories')}
              className={`inline-flex cursor-pointer items-center gap-2 border-b-2 px-4 py-2.5 font-medium transition-colors ${
                activeTab === 'accessories'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              <Layers className="h-4 w-4" />
              <span>模具与套管</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {overmolds.length + protectionOptions.length}
              </span>
            </button>
          </div>
        </section>

        {/* Tab 1: 连接器 */}
        {activeTab === 'connectors' && (
          <>
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
                <label className="relative block sm:col-span-2">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={connQuery}
                    onChange={(e) => setConnQuery(e.target.value)}
                    placeholder="搜索连接器名称、型号、厂商、ID"
                    className="h-9 w-full rounded-md border border-slate-200 bg-white pr-3 pl-9 text-xs outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <select
                  value={connManufacturer}
                  onChange={(e) => setConnManufacturer(e.target.value)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs outline-none transition focus:border-blue-400"
                >
                  <option value="all">全部厂商</option>
                  {connManufacturers.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>

                <select
                  value={connSeries}
                  onChange={(e) => setConnSeries(e.target.value)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs outline-none transition focus:border-blue-400"
                >
                  <option value="all">全部系列</option>
                  {connAllSeries.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                <select
                  value={connShielded}
                  onChange={(e) => setConnShielded(e.target.value)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs outline-none transition focus:border-blue-400"
                >
                  <option value="all">全部屏蔽状态</option>
                  <option value="shielded">已屏蔽</option>
                  <option value="unshielded">未屏蔽</option>
                </select>

                <select
                  value={connType}
                  onChange={(e) => setConnType(e.target.value)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs outline-none transition focus:border-blue-400"
                >
                  <option value="all">全部类型</option>
                  <option value="male">公头 (male)</option>
                  <option value="female">母头 (female)</option>
                  <option value="receptacle">插座 (receptacle)</option>
                </select>

                <select
                  value={connPinCount}
                  onChange={(e) => setConnPinCount(e.target.value)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs outline-none transition focus:border-blue-400"
                >
                  <option value="all">全部 PIN 数</option>
                  {connPinCounts.map((pin) => (
                    <option key={pin} value={pin}>
                      {pin}P
                    </option>
                  ))}
                </select>

                <select
                  value={connPriceStatus}
                  onChange={(e) =>
                    setConnPriceStatus(e.target.value as 'all' | 'priced' | 'unpriced')
                  }
                  className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs outline-none transition focus:border-blue-400"
                >
                  <option value="all">全部价格状态</option>
                  <option value="priced">已定价</option>
                  <option value="unpriced">待定价</option>
                </select>
              </div>
            </section>

            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-[1000px] w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-50 uppercase text-slate-500">
                    <tr>
                      <th className="min-w-[180px] px-4 py-3 font-semibold">连接器与型号</th>
                      <th className="w-[120px] min-w-[100px] px-4 py-3 font-semibold">厂商与系列</th>
                      <th className="w-[110px] min-w-[100px] px-4 py-3 font-semibold">类型 / 屏蔽</th>
                      <th className="w-[100px] min-w-[90px] px-4 py-3 font-semibold">PIN / 间距</th>
                      <th className="w-[140px] min-w-[130px] px-4 py-3 font-semibold">电气与防护规格</th>
                      <th className="w-[110px] min-w-[100px] px-4 py-3 font-semibold">材质</th>
                      <th className="w-[120px] min-w-[110px] px-4 py-3 font-semibold text-right">含税单价</th>
                      <th className="w-[80px] min-w-[80px] px-4 py-3 font-semibold text-center">计价单位</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredConnectors.map((c) => {
                      const price = getConnectorPrice(c);
                      return (
                        <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">{c.name}</p>
                            <p className="mt-0.5 font-mono text-[11px] text-blue-600">
                              {c.model || c.id}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <p className="text-slate-800 font-medium">{c.manufacturer}</p>
                            {c.series && <p className="text-[11px] text-slate-400">{c.series}</p>}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <p>
                              {c.type === 'male'
                                ? '公头'
                                : c.type === 'female'
                                  ? '母头'
                                  : c.type === 'receptacle'
                                    ? '插座'
                                    : c.type}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {c.shielded !== undefined ? (c.shielded ? '已屏蔽' : '未屏蔽') : '-'}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              {c.pinCount}P
                            </span>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {c.pitch ? `${c.pitch}mm` : '-'}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <p>
                              {c.ratedVoltageV ? `${c.ratedVoltageV}V` : ''}
                              {c.ratedVoltageV && c.ratedCurrentA ? ' · ' : ''}
                              {c.ratedCurrentA ? `${c.ratedCurrentA}A` : ''}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {[
                                c.ingressProtection,
                                c.flammabilityRating,
                                c.temperatureRangeC
                                  ? `${c.temperatureRangeC.min ?? ''}~${c.temperatureRangeC.max ?? ''}℃`
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' · ') || '-'}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <div
                              className="max-w-[160px] truncate"
                              title={c.housingMaterial ?? c.contactMaterial ?? '-'}
                            >
                              {c.housingMaterial ?? c.contactMaterial ?? '-'}
                            </div>
                          </td>
                          <td className="w-[120px] min-w-[110px] px-4 py-3 text-right">
                            {price ? (
                              <span className="inline-block whitespace-nowrap rounded-md border border-emerald-200/90 bg-emerald-50/90 px-2.5 py-1 text-xs font-bold tabular-nums text-emerald-700 shadow-2xs">
                                ¥ {Number(price.taxIncludedPrice).toFixed(2)}
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-1 text-xs text-slate-400">待定价</span>
                            )}
                          </td>
                          <td className="w-[80px] min-w-[80px] px-4 py-3 text-center text-slate-500 whitespace-nowrap">
                            {price?.unit ?? '元/个'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filteredConnectors.length === 0 && (
                <div className="py-14 text-center text-sm text-slate-500">
                  未找到匹配的连接器。
                </div>
              )}
            </section>
          </>
        )}

        {/* Tab 2: 线材 */}
        {activeTab === 'wires' && (
          <>
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <label className="relative block sm:col-span-2">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={wireQuery}
                    onChange={(e) => setWireQuery(e.target.value)}
                    placeholder="搜索线缆名称、型号、UL标号、AWG"
                    className="h-9 w-full rounded-md border border-slate-200 bg-white pr-3 pl-9 text-xs outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <select
                  value={wireKind}
                  onChange={(e) => setWireKind(e.target.value)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs outline-none transition focus:border-blue-400"
                >
                  <option value="all">全部线种类型</option>
                  <option value="electronic">电子线 (单芯)</option>
                  <option value="jacketed">护套线 (多芯/屏蔽)</option>
                </select>

                <select
                  value={wireAwg}
                  onChange={(e) => setWireAwg(e.target.value)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs outline-none transition focus:border-blue-400"
                >
                  <option value="all">全部 AWG 规格</option>
                  {wireAwgs.map((awg) => (
                    <option key={awg} value={awg}>
                      {awg} AWG
                    </option>
                  ))}
                </select>

                <select
                  value={wireShielded}
                  onChange={(e) => setWireShielded(e.target.value)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs outline-none transition focus:border-blue-400"
                >
                  <option value="all">全部屏蔽状态</option>
                  <option value="shielded">已屏蔽</option>
                  <option value="unshielded">非屏蔽</option>
                </select>

                <select
                  value={wirePriceStatus}
                  onChange={(e) =>
                    setWirePriceStatus(e.target.value as 'all' | 'priced' | 'unpriced')
                  }
                  className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs outline-none transition focus:border-blue-400"
                >
                  <option value="all">全部价格状态</option>
                  <option value="priced">已定价</option>
                  <option value="unpriced">待定价</option>
                </select>
              </div>
            </section>

            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-[1060px] w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-50 uppercase text-slate-500">
                    <tr>
                      <th className="min-w-[180px] px-4 py-3 font-semibold">线缆名称与型号</th>
                      <th className="w-[100px] min-w-[90px] px-4 py-3 font-semibold">线种 / UL标号</th>
                      <th className="w-[110px] min-w-[100px] px-4 py-3 font-semibold">线规 / 导体</th>
                      <th className="w-[90px] min-w-[80px] px-4 py-3 font-semibold">芯数 / 屏蔽</th>
                      <th className="w-[110px] min-w-[100px] px-4 py-3 font-semibold">绝缘与外径 OD</th>
                      <th className="w-[110px] min-w-[100px] px-4 py-3 font-semibold">耐温与电气</th>
                      <th className="w-[240px] min-w-[230px] px-3.5 py-3 font-semibold text-right">参考单价与档位</th>
                      <th className="w-[80px] min-w-[80px] px-4 py-3 font-semibold text-center">计价单位</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredWires.map((w) => {
                      const wireTiers = getWirePrices(w);
                      const s = w.spec;
                      return (
                        <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">{w.name}</p>
                            <p className="mt-0.5 font-mono text-[11px] text-blue-600">
                              {w.model || w.id}
                            </p>
                            {w.manufacturer && (
                              <p className="text-[11px] text-slate-400">{w.manufacturer}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <p className="font-medium text-slate-800">
                              {s.kind === 'electronic' ? '电子线' : '护套线'}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {s.ulNumber ? `UL${s.ulNumber}` : '-'}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              {s.awg != null ? `${s.awg} AWG` : '-'}
                            </span>
                            {s.kind === 'jacketed' && s.conductorAreaMm2 && (
                              <span className="ml-1 text-[11px] text-slate-500">
                                {s.conductorAreaMm2} mm²
                              </span>
                            )}
                            {s.conductorMaterial && (
                              <p className="mt-1 text-[11px] text-slate-400">{s.conductorMaterial}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <p className="font-medium">
                              {s.kind === 'jacketed' ? `${s.coreCount} 芯` : '单芯'}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {s.kind === 'jacketed' ? (s.shielded ? '屏蔽' : '非屏蔽') : '无屏蔽'}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <p className="font-medium">
                              {s.outerDiameterMm != null
                                ? `OD ${s.outerDiameterMm}mm`
                                : s.insulationDiameterMm != null
                                  ? `OD ${s.insulationDiameterMm}mm`
                                  : '-'}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {s.kind === 'jacketed'
                                ? s.jacketMaterial || '-'
                                : s.insulationMaterial || '-'}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <p>
                              {s.ratedVoltageV ? `${s.ratedVoltageV}V` : ''}
                              {s.temperatureRangeC
                                ? ` · ${s.temperatureRangeC.min ?? ''}~${s.temperatureRangeC.max ?? ''}℃`
                                : ''}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {s.flameTest || s.ingressProtection || '-'}
                            </p>
                          </td>
                          <td className="w-[240px] min-w-[230px] px-3.5 py-3 text-right">
                            {wireTiers.length > 0 ? (
                              <div className="flex flex-col items-end">
                                {wireTiers.length === 1 ? (
                                  <div
                                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200/90 bg-emerald-50/90 px-2.5 py-1 text-xs whitespace-nowrap shadow-2xs"
                                    title={`线长档位 ≤ ${formatWireTierLength(wireTiers[0].lengthMm)} (${wireTiers[0].lengthMm}mm): 含税单价 ¥${Number(wireTiers[0].taxIncludedPrice).toFixed(2)} / 条`}
                                  >
                                    <span className="font-mono text-xs font-semibold text-emerald-700">
                                      {formatWireTierLength(wireTiers[0].lengthMm)}:
                                    </span>
                                    <span className="tabular-nums font-bold text-emerald-800">
                                      ¥ {Number(wireTiers[0].taxIncludedPrice).toFixed(2)}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-2 gap-1.5 w-full min-w-[200px] max-w-[230px]">
                                    {wireTiers.map((tier) => {
                                      const lenStr = formatWireTierLength(tier.lengthMm);
                                      return (
                                        <div
                                          key={tier.lengthMm}
                                          className="flex items-center justify-between gap-1 rounded-md border border-emerald-200/90 bg-emerald-50/90 px-2 py-1 text-xs whitespace-nowrap shadow-2xs"
                                          title={`线长档位 ≤ ${lenStr} (${tier.lengthMm}mm): 含税单价 ¥${Number(tier.taxIncludedPrice).toFixed(2)} / 条`}
                                        >
                                          <span className="font-mono text-xs font-semibold text-emerald-700">
                                            {lenStr}:
                                          </span>
                                          <span className="tabular-nums font-bold text-emerald-800">
                                            ¥ {Number(tier.taxIncludedPrice).toFixed(2)}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="inline-block px-2 py-1 text-xs text-slate-400">
                                待定价
                              </span>
                            )}
                          </td>
                          <td className="w-[80px] min-w-[80px] px-4 py-3 text-center text-slate-500 whitespace-nowrap">
                            元/条
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filteredWires.length === 0 && (
                <div className="py-14 text-center text-sm text-slate-500">
                  未找到匹配的线缆规格。
                </div>
              )}
            </section>
          </>
        )}

        {/* Tab 3: 模具与辅材 */}
        {activeTab === 'accessories' && (
          <>
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <label className="relative block max-w-md">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={accQuery}
                  onChange={(e) => setAccQuery(e.target.value)}
                  placeholder="搜索模具名称、材质、套管名称"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white pr-3 pl-9 text-xs outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            </section>

            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-[920px] w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-50 uppercase text-slate-500">
                    <tr>
                      <th className="min-w-[180px] px-4 py-3 font-semibold">物料名称与代号</th>
                      <th className="w-[140px] min-w-[120px] px-4 py-3 font-semibold">品类与定价机制</th>
                      <th className="w-[140px] min-w-[120px] px-4 py-3 font-semibold">规格与工程特征</th>
                      <th className="w-[120px] min-w-[100px] px-4 py-3 font-semibold">材质与硬度</th>
                      <th className="w-[120px] min-w-[110px] px-4 py-3 font-semibold text-right">参考单价</th>
                      <th className="w-[80px] min-w-[80px] px-4 py-3 font-semibold text-center">计价单位</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* 成型外模 */}
                    {filteredOvermolds.map((m) => {
                      const price = getOvermoldPrice(m);
                      return (
                        <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">{m.name}</p>
                            <p className="mt-0.5 font-mono text-[11px] text-blue-600">{m.id}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                              成型外模 (共享价格库)
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <p>{m.outerForm === 'bent' ? '90°弯头成型' : '直头成型'}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <p>{m.outerMaterial || '-'}</p>
                            {m.outerHardness && (
                              <p className="text-[11px] text-slate-400">硬度: {m.outerHardness}</p>
                            )}
                          </td>
                          <td className="w-[120px] min-w-[110px] px-4 py-3 text-right">
                            {price ? (
                              <span className="inline-block whitespace-nowrap rounded-md border border-emerald-200/90 bg-emerald-50/90 px-2.5 py-1 text-xs font-bold tabular-nums text-emerald-700 shadow-2xs">
                                ¥ {Number(price.taxIncludedPrice).toFixed(2)}
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-1 text-xs text-slate-400">待定价</span>
                            )}
                          </td>
                          <td className="w-[80px] min-w-[80px] px-4 py-3 text-center text-slate-500 whitespace-nowrap">
                            {price?.unit ?? '元/个'}
                          </td>
                        </tr>
                      );
                    })}

                    {/* 防护套管（系统标准配置） */}
                    {filteredProtections.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{p.name}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-blue-600">{p.id}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                            防护辅材 (系统配置标准价)
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <p>线束防护套管 / 波纹管 / 热缩管</p>
                        </td>
                        <td className="px-4 py-3 text-slate-400">-</td>
                        <td className="w-[120px] min-w-[110px] px-4 py-3 text-right">
                          <span className="inline-block whitespace-nowrap rounded-md border border-emerald-200/90 bg-emerald-50/90 px-2.5 py-1 text-xs font-bold tabular-nums text-emerald-700 shadow-2xs">
                            ¥ {Number(p.price || 0).toFixed(2)}
                          </span>
                        </td>
                        <td className="w-[80px] min-w-[80px] px-4 py-3 text-center text-slate-500 whitespace-nowrap">元/米</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredOvermolds.length === 0 && filteredProtections.length === 0 && (
                <div className="py-14 text-center text-sm text-slate-500">
                  未找到匹配的模具或辅材。
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
