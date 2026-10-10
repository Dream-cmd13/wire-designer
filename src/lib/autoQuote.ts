import type { CatalogSnapshot, CatalogWire } from '@/types/catalog';
import type { Connector, HarnessConfig, OvermoldSpec } from '@/types/harness';
import type { MaterialPrice } from '@/repositories/priceRepository';
import { calculatePrice, formatQuoteMoney, type QuoteBreakdown } from './pricing';
import { applyCatalogWireSpec } from './wireCatalog';
import { getAvailableInnerMold } from './overmoldSpec';

export type AutoQuoteEndpointBType = 'connector' | 'cut' | 'strip-tin';
export type AutoQuoteOuterMoldType = 'none' | 'pvc-45p' | 'tpe';
export type AutoQuoteInnerMoldType = 'none' | 'pe';

export interface AutoQuoteFormState {
  connectorAId: string;
  endpointBType: AutoQuoteEndpointBType;
  connectorBId: string;
  outerMoldType: AutoQuoteOuterMoldType;
  outerMoldSpecId: string;
  outerMoldEnds: 1 | 2;
  innerMoldType: AutoQuoteInnerMoldType;
  wireResourceId: string;
  lengthMm: number;
  quantity: number;
}

export interface AutoQuoteEvaluation {
  status: 'ready' | 'blocked' | 'manual' | 'unsupported' | 'incomplete';
  issues: string[];
  price?: QuoteBreakdown;
  config?: HarnessConfig;
  connA?: Connector;
  connB?: Connector;
  wire?: CatalogWire;
  overmold?: OvermoldSpec;
}

export const DEFAULT_AUTO_QUOTE_FORM: AutoQuoteFormState = {
  connectorAId: '',
  endpointBType: 'connector',
  connectorBId: '',
  outerMoldType: 'pvc-45p',
  outerMoldSpecId: '',
  outerMoldEnds: 2,
  innerMoldType: 'none',
  wireResourceId: '',
  lengthMm: 1000,
  quantity: 1000,
};

export function isSupportedConnector(connector: Connector): boolean {
  return /\bM(?:8|12)(?!\d)/i.test(connector.series || connector.name);
}

export function isSupportedOvermold(spec: OvermoldSpec): boolean {
  return spec.outerMaterial === '黑色PVC' && spec.outerHardness === '45P';
}

export function buildAutoQuoteConfig(
  form: AutoQuoteFormState,
  catalog: CatalogSnapshot | null,
): {
  config: HarnessConfig | null;
  issues: string[];
  unsupportedIssues: string[];
  connA?: Connector;
  connB?: Connector;
  wire?: CatalogWire;
  overmold?: OvermoldSpec;
} {
  const issues: string[] = [];
  const unsupportedIssues: string[] = [];

  // 1. 待支持功能拦截（首版不提供正式报价，避免漏算费用）
  if (form.endpointBType === 'strip-tin') {
    unsupportedIssues.push('B端剥皮沾锡工艺计费待支持，首版暂不提供正式报价');
  }
  if (form.outerMoldType === 'tpe') {
    unsupportedIssues.push('TPE 外模计费待支持，当前仅支持黑色 PVC 45P');
  }

  // 2. 基础输入校验
  if (!Number.isSafeInteger(form.lengthMm) || form.lengthMm <= 0) {
    issues.push('线长必须为正整数毫米');
  }
  if (!Number.isSafeInteger(form.quantity) || form.quantity < 1 || form.quantity > 1000000) {
    issues.push('订单数量必须为 1 至 1000000 的整数');
  }

  // 3. 物料解析
  const connA = catalog?.connectors.find((item) => item.id === form.connectorAId);
  if (!form.connectorAId) {
    issues.push('请选择 A 端连接器');
  } else if (!connA) {
    issues.push('未找到所选 A 端连接器物料');
  } else if (!isSupportedConnector(connA)) {
    issues.push('A 端连接器须为 M8 或 M12 系列');
  }

  let connB: Connector | undefined;
  if (form.endpointBType === 'connector') {
    connB = catalog?.connectors.find((item) => item.id === form.connectorBId);
    if (!form.connectorBId) {
      issues.push('请选择 B 端连接器');
    } else if (!connB) {
      issues.push('未找到所选 B 端连接器物料');
    } else if (!isSupportedConnector(connB)) {
      issues.push('B 端连接器须为 M8 或 M12 系列');
    }
  }

  const wire = catalog?.wires.find((item) => item.resourceItemId === form.wireResourceId);
  if (!form.wireResourceId) {
    issues.push('请选择线材物料');
  } else if (!wire) {
    issues.push('未找到所选线材物料');
  }

  let overmold: OvermoldSpec | undefined;
  if (form.outerMoldType === 'pvc-45p') {
    overmold = catalog?.overmolds.find((item) => item.id === form.outerMoldSpecId);
    if (!form.outerMoldSpecId) {
      issues.push('请选择黑色 PVC 45P 外模规格');
    } else if (!overmold) {
      issues.push('未找到所选外模规格');
    } else if (!isSupportedOvermold(overmold)) {
      issues.push('外模须为目录中的黑色 PVC 45P');
    }
  }
  if (form.innerMoldType === 'pe' && (!overmold || !getAvailableInnerMold(overmold))) {
    issues.push('请选择包含低密度透明 PE 内模的外模规格');
  }

  if (issues.length > 0 || unsupportedIssues.length > 0 || !connA || !wire) {
    return {
      config: null,
      issues,
      unsupportedIssues,
      connA,
      connB,
      wire,
      overmold,
    };
  }

  // 4. 组装 HarnessConfig
  const processingEnds = form.endpointBType === 'connector' ? 2 : 1;
  const connectors = [
    {
      id: 'quote-conn-a',
      connector: connA,
      label: 'A 端',
      position: { x: 50, y: 150 },
      jumpers: [],
    },
  ];

  if (form.endpointBType === 'connector' && connB) {
    connectors.push({
      id: 'quote-conn-b',
      connector: connB,
      label: 'B 端',
      position: { x: 550, y: 150 },
      jumpers: [],
    });
  }

  const baseSpec = {
    kind: 'electronic' as const,
    awg: 24,
    color: '黑色',
    ulNumber: '1007' as const,
    lengthMm: form.lengthMm,
    endTreatment: {
      start: { stripped: false, termination: 'none' as const },
      end: { stripped: false, termination: 'none' as const },
    },
  };

  const wireSpec = applyCatalogWireSpec({ ...baseSpec, lengthMm: form.lengthMm }, wire.spec);
  const materials = [
    {
      id: 'quote-wire-main',
      resourceItemId: wire.resourceItemId,
      name: wire.name,
      position: { x: 200, y: 150 },
      width: 1,
      circuits: [],
      spec: wireSpec,
    },
  ];

  const moldCount = form.outerMoldType === 'pvc-45p' && overmold
    ? Math.min(form.outerMoldEnds, processingEnds)
    : 0;

  const models = Array.from({ length: moldCount }, (_, index) => ({
    id: `quote-mold-${index + 1}`,
    kind: 'outer-box' as const,
    position: { x: index === 0 ? 80 : 520, y: 150 },
    width: 30,
    height: 30,
    overmoldSpecId: overmold!.id,
    includeInnerMold: form.innerMoldType === 'pe',
  }));

  const nameParts = [connA.name];
  if (form.endpointBType === 'connector' && connB) {
    nameParts.push(connB.name);
  } else if (form.endpointBType === 'cut') {
    nameParts.push('切断');
  } else {
    nameParts.push('剥皮沾锡');
  }
  const name = `${nameParts.join(' - ')} (${form.lengthMm}mm)`;

  const now = Date.now();
  const config: HarnessConfig = {
    schemaVersion: 3,
    id: 'auto-quote-runtime-session',
    name,
    createdAt: now,
    updatedAt: now,
    connectors,
    materials,
    models,
    protectiveSleeves: [],
    twoDImages: [],
    quantity: form.quantity,
    leadTime: 'standard',
    quotation: {
      processingEnds,
      srPoints: 0,
    },
  };

  return {
    config,
    issues: [],
    unsupportedIssues: [],
    connA,
    connB,
    wire,
    overmold,
  };
}

export function evaluateAutoQuote(
  form: AutoQuoteFormState,
  prices: MaterialPrice[],
  catalog: CatalogSnapshot | null,
): AutoQuoteEvaluation {
  const { config, issues, unsupportedIssues, connA, connB, wire, overmold } = buildAutoQuoteConfig(form, catalog);

  if (unsupportedIssues.length > 0) {
    return {
      status: 'unsupported',
      issues: unsupportedIssues,
      connA,
      connB,
      wire,
      overmold,
    };
  }

  if (issues.length > 0 || !config) {
    return {
      status: 'incomplete',
      issues,
      connA,
      connB,
      wire,
      overmold,
    };
  }

  const result = calculatePrice(config, prices, catalog);

  if (result.status === 'ready') {
    return {
      status: 'ready',
      issues: [],
      price: result.price,
      config,
      connA,
      connB,
      wire,
      overmold,
    };
  }

  return {
    status: result.status,
    issues: result.issues,
    config,
    connA,
    connB,
    wire,
    overmold,
  };
}

export function buildQuoteSummaryText(
  form: AutoQuoteFormState,
  evaluation: AutoQuoteEvaluation,
  connA?: { name: string; model?: string; pinCount: number },
  connB?: { name: string; model?: string; pinCount: number },
  wire?: { name: string },
  overmoldName?: string,
): string {
  if (!evaluation.price) return '';
  const endpointBDesc =
    form.endpointBType === 'connector'
      ? (connB ? `${connB.model || connB.name} (${connB.pinCount}Pin)` : '连接器')
      : (form.endpointBType === 'cut' ? '切断齐头' : '剥皮沾锡');
  const moldDesc =
    form.outerMoldType === 'pvc-45p'
      ? `${overmoldName || '黑色PVC 45P'} (${form.outerMoldEnds === 2 ? '两端成型' : '单端成型'})`
      : '无外模';

  return [
    '【线束询价核算结果】',
    `• A 端连接器: ${connA ? `${connA.model || connA.name} (${connA.pinCount}Pin)` : '-'}`,
    `• B 端形式: ${endpointBDesc}`,
    `• 线材型号: ${wire?.name || '-'}`,
    `• 外模配置: ${moldDesc}`,
    `• 内模配置: ${form.innerMoldType === 'pe' ? 'PE 内模' : '无内模'}`,
    `• 报价线长: ${form.lengthMm} mm`,
    `• 询价数量: ${form.quantity} 条`,
    `• 含税运单价: ¥${formatQuoteMoney(evaluation.price.unitPrice)} / 条`,
    `• 订单总价: ¥${formatQuoteMoney(evaluation.price.totalPrice)} 元`,
    '• 交付条款: 含 13% 增值税专用发票及指定地点标准运费',
  ].join('\n');
}

