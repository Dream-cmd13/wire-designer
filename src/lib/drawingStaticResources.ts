import type {
  DrawingCommonPhrase,
  DrawingDocument,
  DrawingIconResource,
  DrawingTemplateSummary,
} from '@/types/drawing';
import { createBlankDrawingDocument, createDrawingId, defaultDrawingObjectStyle } from '@/lib/drawingDocument';

export type DrawingProcessNotePreset = {
  id: string;
  tab: 'process' | 'tech';
  title: string;
  content: string;
};

export const DRAWING_PROCESS_PRESETS: readonly DrawingProcessNotePreset[] = [
  {
    id: 'process-packaging',
    tab: 'process',
    title: '包装说明',
    content: [
      '包装说明：',
      '1按示意图尺寸扎线，10PCS/把，用草绳绑扎;',
      '2纸箱底部封箱，放防水袋; 底部放隔板，下部放两套刀卡，',
      '每格装20PCS产品，刀卡间用隔板隔开; 上部放两层，每层放120PCS产品;',
      '下部与上部用隔板隔开; 每箱装产品400PCS。',
    ].join('\n'),
  },
  {
    id: 'process-manufacturing',
    tab: 'process',
    title: '制程工艺说明',
    content: [
      '制程工艺说明：',
      '裁线长度：1000±10mm',
      '1.P1端：',
      '1.1 线材剥皮（含编网）12±1mm，铝箔挑除，地线保留。',
      '1.2 芯线剥皮1.5-2.0mm，按接线表焊线。',
      '1.3 成型内、外模。（编网包入内模）',
      '2.P2：',
      '2.1 线材剥皮（含编网）12±1mm，铝箔挑除，地线保留。',
      '2.2 芯线剥皮1.5-2.0mm，按接线表焊线。',
      '2.3 成型内、外模。（编网包入内模）',
    ].join('\n'),
  },
  {
    id: 'tech-length-tolerance',
    tab: 'tech',
    title: 'L尺寸公差表',
    content: [
      'L尺寸公差表（单位:mm）',
      '≤300 ±10mm',
      '> 300≤1500 ±20mm',
      '> 1500≤3000 ±25mm',
      '> 3000≤5000 ±30mm',
      '> 5000≤8000 ±50mm',
    ].join('\n'),
  },
  {
    id: 'tech-requirements',
    tab: 'tech',
    title: '技术要求',
    content: [
      '技术要求：',
      '1.所有材料需符合RoHS;',
      '2.线材表面：无破损、无脏污、印字清晰等;',
      '3.线材剥头时，绝缘层及芯线导体切除应整齐，芯线导体不应划伤、卷曲',
      '或产生刻痕、断股；绝缘层不应被擦伤、压伤或产生裂纹，即不允许绝缘层厚度减小;',
      '4.注意禁止用裸手接触有镀层的裸导线，必须带上干净的手套操作。并且',
      '剥出的芯线导体应及时加工，以防导体外表面氧化;',
    ].join('\n'),
  },
];

const DRAWING_TEMPLATES = [
  {
    id: 'template-single',
    name: '单头普通电子线模板',
    category: '内线',
    description: '单连接器普通电子线',
    currentVersion: 1,
  },
  {
    id: 'template-double',
    name: '双头四芯屏蔽线模板',
    category: '内线',
    description: '双连接器四芯屏蔽线',
    currentVersion: 1,
  },
  {
    id: 'template-usb-braided-tin',
    name: '7/0.15*2芯红黑+7/0.12*2芯白绿 铝箔 编织32/0.10TCCS OD3.5 黑色编纱编后OD3.8 USB编织线 带卡位 尾部上锡',
    category: '外线 / USB',
    description: 'USB 编织线，带线尾卡位与尾部上锡',
    currentVersion: 1,
  },
  {
    id: 'template-usb-spring',
    name: '9/0.10BS*4C(红白绿黑)OD3.6mm 贝吉色TPU外被 弹簧线 USB AM-XH2.54P 双头',
    category: '外线 / USB',
    description: 'USB AM 至 XH2.54P 弹簧线双头连接器',
    currentVersion: 1,
  },
  {
    id: 'template-usb-am-bm',
    name: 'USB AM & USB BM 不含头1200mm',
    category: '外线 / USB',
    description: 'USB AM 到 USB BM 标准连接线',
    currentVersion: 1,
  },
  {
    id: 'template-typec-double',
    name: '两头TYPE C公头接口，一头弯头，另一头直头，长度1.5米，不含头',
    category: '外线 / USB',
    description: 'Type-C 弯头转直头双头连接线',
    currentVersion: 1,
  },
  {
    id: 'template-typec-xarr',
    name: 'TYPE-C TO XARR-09V',
    category: '外线 / USB',
    description: 'Type-C 转 XARR-09V 连接线束',
    currentVersion: 1,
  },
] satisfies readonly DrawingTemplateSummary[];

const DRAWING_TEMPLATE_DOCUMENTS: Record<string, DrawingDocument> = {
  'template-single': drawingTemplate('template-single', '单头普通电子线模板', 'TPL-SINGLE', 'single'),
  'template-double': drawingTemplate('template-double', '双头四芯屏蔽线模板', 'TPL-DOUBLE', 'double'),
  'template-usb-braided-tin': drawingTemplate('template-usb-braided-tin', 'USB编织线 带卡位 尾部上锡', 'TPL-USB-01', 'single'),
  'template-usb-spring': drawingTemplate('template-usb-spring', 'USB AM-XH2.54P 双头', 'TPL-USB-02', 'double'),
  'template-usb-am-bm': drawingTemplate('template-usb-am-bm', 'USB AM & USB BM', 'TPL-USB-03', 'double'),
  'template-typec-double': drawingTemplate('template-typec-double', '两头TYPE C公头接口', 'TPL-TC-04', 'double'),
  'template-typec-xarr': drawingTemplate('template-typec-xarr', 'TYPE-C TO XARR-09V', 'TPL-TC-05', 'double'),
};

const DRAWING_COMMON_PHRASES = [
  { id: '30000000-0000-4000-8000-000000004001', category: '技术要求', phrase: '成品须进行导通及短路测试。' },
  { id: '30000000-0000-4000-8000-000000004002', category: '技术要求', phrase: '连接器端子压接后不得有松脱、变形。' },
  { id: '30000000-0000-4000-8000-000000004003', category: '包装', phrase: '线束盘绕后装入PE袋。' },
] satisfies readonly DrawingCommonPhrase[];

const icon = (id: string, name: string, category: string, svgPath: string): DrawingIconResource => ({
  id,
  name,
  category,
  svgPath,
  defaultWidth: 24,
  defaultHeight: 24,
});

const DRAWING_ICONS = [
  // 箭头
  icon('arrow-right', '右向箭头', '箭头', 'M3 12h15M13 6l6 6-6 6'),
  icon('arrow-left', '左向箭头', '箭头', 'M21 12H6M11 6l-6 6 6 6'),
  icon('arrow-up', '上向箭头', '箭头', 'M12 21V6M6 11l6-6 6 6'),
  icon('arrow-down', '下向箭头', '箭头', 'M12 3v15M6 13l6 6 6-6'),
  icon('arrow-up-down', '上下箭头', '箭头', 'M12 3v18M6 9l6-6 6 6M6 15l6 6 6-6'),
  icon('arrow-left-right', '水平双向', '箭头', 'M3 12h18M8 7l-5 5 5 5M16 7l5 5-5 5'),
  icon('arrow-leader', '引出箭头', '箭头', 'M4 20L18 6M12 6h6v6'),
  icon('arrow-turn-up', '拐弯箭头', '箭头', 'M4 18h8a4 4 0 0 0 4-4V6M12 10l4-4 4 4'),
  icon('arrow-return', '回车弯头', '箭头', 'M20 6v6a3 3 0 0 1-3 3H5M9 11l-4 4 4 4'),

  // 数学符号
  icon('math-plus', '加号', '数学符号', 'M12 5v14M5 12h14'),
  icon('math-minus', '减号', '数学符号', 'M5 12h14'),
  icon('math-multiply', '乘号', '数学符号', 'M6 6l12 12M18 6 6 18'),
  icon('math-divide', '除号', '数学符号', 'M5 12h14M12 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2z'),
  icon('math-plus-minus', '正负号 ±', '数学符号', 'M12 3v10M7 8h10M5 19h14'),
  icon('math-equals', '等号', '数学符号', 'M5 9h14M5 15h14'),
  icon('math-not-equals', '不等号 ≠', '数学符号', 'M5 9h14M5 15h14M16 4L8 20'),
  icon('math-greater', '大于 >', '数学符号', 'M6 6l12 6-12 6'),
  icon('math-less', '小于 <', '数学符号', 'M18 6l-12 6 12 6'),
  icon('math-greater-equal', '大于等于 ≥', '数学符号', 'M6 5l12 5-12 5M6 19h12'),
  icon('math-less-equal', '小于等于 ≤', '数学符号', 'M18 5l-12 5 12 5M6 19h12'),
  icon('math-approx', '约等于 ≈', '数学符号', 'M5 8c3-2 6-2 7 0s4 2 7 0M5 14c3-2 6-2 7 0s4 2 7 0'),

  // 单位
  icon('unit-mm', '毫米 mm', '单位', 'M4 7h16M4 17h16M7 5v4M12 5v4M17 5v4M7 15v4M12 15v4M17 15v4'),
  icon('unit-degree', '角度 °', '单位', 'M8 17a4 4 0 1 1 8 0M8 17h8M12 13v-6'),
  icon('unit-diameter', '直径 Ø', '单位', 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M6 18L18 6'),
  icon('unit-radius', '半径 R', '单位', 'M5 19a10 10 0 0 1 10-10M15 9h5v5'),
  icon('unit-celsius', '摄氏度 ℃', '单位', 'M7 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM20 9a7 7 0 1 0 0 10'),
  icon('unit-square-meter', '平方米 m²', '单位', 'M3 18v-8l4 8 4-8v8M17 9c0-1.5 1-2.5 2.5-2.5s2.5 1 2.5 2.5c0 1.5-2 3-5 5h5'),
  icon('unit-percent', '百分号 %', '单位', 'M19 5L5 19M7 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'),

  // 公差
  icon('tolerance-plus-minus', '正负公差', '公差', 'M12 3v9M8 8h8M5 18h14'),
  icon('tolerance-limit', '极限公差', '公差', 'M5 5h14v14H5zM8 12h8'),
  icon('tolerance-surface', '表面公差', '公差', 'M4 18h16M6 18l6-12 6 12'),
  icon('tolerance-center', '中心线', '公差', 'M3 12h18M12 3v18'),

  // 电气
  icon('electrical-ground', '接地', '电气', 'M12 3v10M6 13h12M8 17h8M10 21h4'),
  icon('electrical-battery', '电池', '电气', 'M4 8h16v8H4zM9 5v6M15 5v6'),
  icon('electrical-resistor', '电阻', '电气', 'M2 12h4l2-4 4 8 4-8 2 4h4'),
  icon('electrical-switch', '开关', '电气', 'M4 12h6l4-5M14 19h6'),

  // 连接器
  icon('connector-male', '公连接器', '连接器', 'M4 5h16v14H4zM8 9v6M12 9v6M16 9v6'),
  icon('connector-female', '母连接器', '连接器', 'M4 7h16v10H4zM8 11h2M13 11h2'),
  icon('connector-pin-array', '针脚阵列', '连接器', 'M6 5v14M10 5v14M14 5v14M18 5v14'),
  icon('connector-plug', '插头', '连接器', 'M4 8h10v8H4zM14 10h6v4h-6'),

  // 线束
  icon('harness-bundle', '线束束线', '线束', 'M3 8c5 0 5 8 10 8s5-8 8-8M3 12c5 0 5 8 10 8s5-8 8-8'),
  icon('harness-branch', '线束分支', '线束', 'M4 19l7-7m0 0 7-7m-7 7H4m7 0h9'),
  icon('harness-shield', '屏蔽线', '线束', 'M3 12h18M6 8l4 4-4 4M14 8l4 4-4 4'),
  icon('harness-splice', '线束接续', '线束', 'M3 12h18M9 7l6 10M15 7l-6 10'),

  // 端子
  icon('terminal-ring', '环形端子', '端子', 'M6 12a6 6 0 1 0 12 0a6 6 0 1 0-12 0M18 12h4'),
  icon('terminal-blade', '片式端子', '端子', 'M4 8h14v8H4zM18 10h3v4h-3'),
  icon('terminal-crimp', '压接端子', '端子', 'M4 5h16v14H4zM8 9h8v6H8z'),
  icon('terminal-pin', '针式端子', '端子', 'M4 12h16M8 8v8M12 8v8M16 8v8'),

  // 几何图形
  icon('geometry-rectangle', '矩形', '几何图形', 'M4 4h16v16H4z'),
  icon('geometry-rounded-rect', '圆角矩形', '几何图形', 'M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z'),
  icon('geometry-circle', '圆形', '几何图形', 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16'),
  icon('geometry-ellipse', '椭圆', '几何图形', 'M12 7c5.5 0 9 2.2 9 5s-3.5 5-9 5-9-2.2-9-5 3.5-5 9-5z'),
  icon('geometry-triangle', '等边三角形', '几何图形', 'M12 4l8 16H4z'),
  icon('geometry-right-triangle', '直角三角形', '几何图形', 'M5 5v14h14z'),
  icon('geometry-diamond', '菱形', '几何图形', 'M12 3l9 9-9 9-9-9z'),
  icon('geometry-trapezoid', '梯形', '几何图形', 'M7 5h10l4 14H3z'),
  icon('geometry-pentagon', '五边形', '几何图形', 'M12 3l8 6-3 12H7L4 9z'),
  icon('geometry-hexagon', '六边形', '几何图形', 'M12 3l7 4.5v9L12 21l-7-4.5v-9z'),
  icon('geometry-crosshair', '十字中心', '几何图形', 'M3 12h18M12 3v18'),

  // 工艺
  icon('process-tinning', '上锡', '工艺', 'M4 12h16M8 8v8M16 8v8'),

  // 标识与包装
  icon('symbol-check', '对勾 ✓', '标识与包装', 'M5 13l4 4L19 7'),
  icon('symbol-warning', '警告', '标识与包装', 'M12 2L22 20H2zM12 8v5M12 17h.01'),
  icon('pkg-fragile', '易碎物品', '标识与包装', 'M6 4h12v4a6 6 0 0 1-5 5.9V18h3v2H8v-2h3v-4.1A6 6 0 0 1 6 8V4z'),
  icon('pkg-rain', '防雨防潮', '标识与包装', 'M12 3a8 8 0 0 1 8 7H4a8 8 0 0 1 8-7zm0 7v9a2 2 0 0 1-2 2'),
  icon('pkg-recycle', '循环回收', '标识与包装', 'M7 7h10l-2-3M17 7l2 3.5M17 17v-6l3 2M17 17l-3.5 2M7 17h6l-2 3M7 17l-2-3.5M7 7v6l-3-2M7 7l3.5-2'),
  icon('symbol-star', '五角星', '标识与包装', 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1.1-6.2-4.5-4.4 6.2-.9z'),
] satisfies readonly DrawingIconResource[];

function drawingTemplate(id: string, name: string, drawingNo: string, mode: 'single' | 'double'): DrawingDocument {
  const base = createBlankDrawingDocument(name, new Date('2026-11-27T00:00:00Z'));
  const objects = [
    {
      id: createDrawingId('connector'),
      kind: 'connector' as const,
      x: 110,
      y: 170,
      width: 170,
      height: 110,
      rotation: 0,
      zIndex: 10,
      locked: false,
      visible: true,
      style: { ...defaultDrawingObjectStyle },
      label: 'P1 连接器',
      pinCount: 4,
      gender: 'receptacle' as const,
      side: mode === 'single' ? 'none' as const : 'left' as const,
      showPinGrid: false,
    },
    ...(mode === 'double'
      ? [{
          id: createDrawingId('connector'),
          kind: 'connector' as const,
          x: 910,
          y: 170,
          width: 170,
          height: 110,
          rotation: 0,
          zIndex: 10,
          locked: false,
          visible: true,
          style: { ...defaultDrawingObjectStyle },
          label: 'P2 连接器',
          pinCount: 4,
          gender: 'male' as const,
          side: 'right' as const,
          showPinGrid: false,
        }]
      : []),
    {
      id: createDrawingId('wire-bundle'),
      kind: 'wire-bundle' as const,
      x: 280,
      y: 185,
      width: mode === 'double' ? 630 : 660,
      height: 80,
      rotation: 0,
      zIndex: 4,
      locked: false,
      visible: true,
      style: { ...defaultDrawingObjectStyle, fill: '#f8fafc' },
      label: mode === 'double' ? '主线束' : '尾部上锡',
      wireCount: 4,
      wireKind: 'shielded' as const,
    },
    {
      id: createDrawingId('dimension'),
      kind: 'dimension' as const,
      x: 110,
      y: 110,
      width: mode === 'double' ? 970 : 830,
      height: 40,
      rotation: 0,
      zIndex: 5,
      locked: false,
      visible: true,
      style: { ...defaultDrawingObjectStyle },
      label: '1000±10 mm',
      start: { x: 110, y: 130 },
      end: { x: mode === 'double' ? 1080 : 940, y: 130 },
    },
    ...base.objects,
  ];
  return {
    ...base,
    id,
    name,
    createdAt: 0,
    updatedAt: 0,
    objects,
    titleBlock: { title: name, drawingNo, revision: 'A' },
  };
}

export function listStaticDrawingTemplates(): DrawingTemplateSummary[] {
  return DRAWING_TEMPLATES.map((template) => ({ ...template }));
}

export function loadStaticDrawingTemplate(id: string): DrawingDocument | null {
  const document = DRAWING_TEMPLATE_DOCUMENTS[id];
  return document ? structuredClone(document) : null;
}

export function listStaticDrawingCommonPhrases(): DrawingCommonPhrase[] {
  return DRAWING_COMMON_PHRASES.map((phrase) => ({ ...phrase }));
}

export function listStaticDrawingIcons(): DrawingIconResource[] {
  return DRAWING_ICONS.map((icon) => ({ ...icon }));
}

export type DrawingComponentGraphicCategory =
  | '包装方式'
  | '工艺说明'
  | '裁线图型'
  | '线材图型'
  | '辅材图型'
  | '不规则图型'
  | '物料规格'
  | '线材截面图';

export type DrawingComponentGraphic = {
  id: string;
  name: string;
  category: DrawingComponentGraphicCategory;
  subCategory: string;
  svgPreview: string;
};

const pkgWrapSvg = (
  variant:
    | 'figure8'
    | 'figure8-labeled'
    | 'pe-bag'
    | 'waterproof-bag'
    | 'carton'
    | 'circle'
    | 'figure8-ferrite'
    | 'figure8-ferrite-sr'
    | 'figure8-tin',
) => {
  if (variant === 'pe-bag') {
    return '<svg viewBox="0 0 180 90" xmlns="http://www.w3.org/2000/svg"><rect x="44" y="10" width="92" height="70" rx="1" fill="none" stroke="#334155" stroke-width="1.1"/><line x1="44" y1="18" x2="136" y2="18" stroke="#475569" stroke-width="0.9"/><line x1="44" y1="22" x2="136" y2="22" stroke="#94a3b8" stroke-width="0.7"/><circle cx="126" cy="70" r="2.2" fill="none" stroke="#64748b" stroke-width="0.8"/></svg>';
  }
  if (variant === 'waterproof-bag') {
    return '<svg viewBox="0 0 180 90" xmlns="http://www.w3.org/2000/svg"><ellipse cx="90" cy="20" rx="46" ry="7" fill="none" stroke="#334155" stroke-width="1"/><path d="M44 20 L44 74 Q90 83 136 74 L136 20" fill="none" stroke="#334155" stroke-width="1"/><line x1="94" y1="52" x2="112" y2="38" stroke="#94a3b8" stroke-width="0.8"/><line x1="102" y1="58" x2="116" y2="47" stroke="#94a3b8" stroke-width="0.8"/></svg>';
  }
  if (variant === 'carton') {
    return '<svg viewBox="0 0 180 90" xmlns="http://www.w3.org/2000/svg"><polygon points="56,34 90,20 124,34 90,48" fill="none" stroke="#334155" stroke-width="1"/><polygon points="56,34 90,48 90,76 56,62" fill="none" stroke="#334155" stroke-width="1"/><polygon points="90,48 124,34 124,62 90,76" fill="none" stroke="#334155" stroke-width="1"/><polygon points="56,34 90,20 76,12 42,26" fill="none" stroke="#475569" stroke-width="0.9"/><polygon points="124,34 90,20 104,12 138,26" fill="none" stroke="#475569" stroke-width="0.9"/></svg>';
  }
  if (variant === 'circle') {
    return '<svg viewBox="0 0 180 90" xmlns="http://www.w3.org/2000/svg"><circle cx="90" cy="48" r="24" fill="none" stroke="#1e293b" stroke-width="1.3"/><circle cx="90" cy="48" r="20" fill="none" stroke="#475569" stroke-width="1"/><circle cx="90" cy="48" r="16" fill="none" stroke="#64748b" stroke-width="0.8"/><line x1="66" y1="12" x2="66" y2="48" stroke="#64748b" stroke-width="0.7"/><line x1="114" y1="12" x2="114" y2="48" stroke="#64748b" stroke-width="0.7"/><line x1="66" y1="16" x2="114" y2="16" stroke="#1e293b" stroke-width="1"/><text x="90" y="13" text-anchor="middle" font-size="8" fill="#1e293b">100±10</text><rect x="64" y="64" width="8" height="12" fill="#fff" stroke="#475569" stroke-width="0.8"/><rect x="108" y="64" width="8" height="12" fill="#fff" stroke="#475569" stroke-width="0.8"/></svg>';
  }
  if (variant === 'figure8-labeled') {
    return '<svg viewBox="0 0 220 90" xmlns="http://www.w3.org/2000/svg"><line x1="20" y1="14" x2="20" y2="52" stroke="#64748b" stroke-width="0.7"/><line x1="204" y1="14" x2="204" y2="52" stroke="#64748b" stroke-width="0.7"/><line x1="20" y1="20" x2="204" y2="20" stroke="#1e293b" stroke-width="0.9"/><text x="112" y="17" text-anchor="middle" font-size="7.5" fill="#1e293b">总长度小于120</text><line x1="68" y1="30" x2="68" y2="52" stroke="#64748b" stroke-width="0.7"/><line x1="20" y1="36" x2="68" y2="36" stroke="#1e293b" stroke-width="0.8"/><text x="44" y="33" text-anchor="middle" font-size="7" fill="#1e293b">30~40</text><rect x="14" y="50" width="8" height="16" fill="#fff" stroke="#334155" stroke-width="0.9"/><rect x="64" y="50" width="8" height="16" fill="#fff" stroke="#334155" stroke-width="0.9"/><line x1="22" y1="53" x2="64" y2="53" stroke="#1e293b" stroke-width="1"/><line x1="22" y1="56" x2="64" y2="56" stroke="#1e293b" stroke-width="1"/><line x1="22" y1="59" x2="64" y2="59" stroke="#1e293b" stroke-width="1"/><line x1="22" y1="62" x2="64" y2="62" stroke="#1e293b" stroke-width="1"/><rect x="72" y="45" width="132" height="24" rx="12" fill="none" stroke="#1e293b" stroke-width="1.1"/><rect x="76" y="48" width="124" height="18" rx="9" fill="none" stroke="#475569" stroke-width="0.9"/><rect x="80" y="51" width="116" height="12" rx="6" fill="none" stroke="#64748b" stroke-width="0.8"/><rect x="135" y="42" width="6" height="30" rx="1" fill="#fff" stroke="#334155" stroke-width="0.9"/></svg>';
  }
  if (variant === 'figure8-ferrite-sr') {
    return '<svg viewBox="0 0 180 90" xmlns="http://www.w3.org/2000/svg"><rect x="34" y="34" width="66" height="22" rx="11" fill="none" stroke="#1e293b" stroke-width="1.2"/><rect x="38" y="37" width="58" height="16" rx="8" fill="none" stroke="#475569" stroke-width="0.9"/><rect x="64" y="31" width="6" height="28" rx="1" fill="#e2e8f0" stroke="#334155" stroke-width="0.9"/><line x1="16" y1="45" x2="34" y2="45" stroke="#1e293b" stroke-width="1.4"/><line x1="100" y1="45" x2="152" y2="45" stroke="#1e293b" stroke-width="1.4"/><rect x="116" y="40" width="12" height="10" rx="1.5" fill="#cbd5e1" stroke="#334155" stroke-width="0.9"/><rect x="142" y="40" width="10" height="10" rx="1" fill="#475569"/><line x1="152" y1="42" x2="168" y2="39" stroke="#dc2626" stroke-width="1.2"/><line x1="152" y1="45" x2="168" y2="45" stroke="#16a34a" stroke-width="1.2"/><line x1="152" y1="48" x2="168" y2="51" stroke="#111827" stroke-width="1.2"/><text x="67" y="24" text-anchor="middle" font-size="7" fill="#1e293b">100±10</text><text x="132" y="24" text-anchor="middle" font-size="7" fill="#1e293b">50~150</text></svg>';
  }
  if (variant === 'figure8-tin') {
    return '<svg viewBox="0 0 180 90" xmlns="http://www.w3.org/2000/svg"><rect x="32" y="34" width="68" height="22" rx="11" fill="none" stroke="#1e293b" stroke-width="1.2"/><rect x="36" y="37" width="60" height="16" rx="8" fill="none" stroke="#475569" stroke-width="0.9"/><rect x="63" y="31" width="6" height="28" rx="1" fill="#e2e8f0" stroke="#334155" stroke-width="0.9"/><line x1="14" y1="45" x2="32" y2="45" stroke="#1e293b" stroke-width="1.4"/><line x1="100" y1="45" x2="148" y2="45" stroke="#1e293b" stroke-width="1.4"/><line x1="148" y1="43" x2="166" y2="43" stroke="#111827" stroke-width="1.5"/><line x1="148" y1="47" x2="166" y2="47" stroke="#dc2626" stroke-width="1.5"/></svg>';
  }
  return '<svg viewBox="0 0 180 90" xmlns="http://www.w3.org/2000/svg"><rect x="44" y="34" width="92" height="22" rx="11" fill="none" stroke="#1e293b" stroke-width="1.2"/><rect x="48" y="37" width="84" height="16" rx="8" fill="none" stroke="#475569" stroke-width="0.9"/><rect x="52" y="40" width="76" height="10" rx="5" fill="none" stroke="#64748b" stroke-width="0.8"/><rect x="87" y="31" width="6" height="28" rx="1" fill="#e2e8f0" stroke="#334155" stroke-width="0.9"/><line x1="20" y1="45" x2="44" y2="45" stroke="#1e293b" stroke-width="1.4"/><line x1="136" y1="45" x2="160" y2="45" stroke="#1e293b" stroke-width="1.4"/></svg>';
};

const DRAWING_COMPONENT_GRAPHICS: readonly DrawingComponentGraphic[] = [
  { id: 'pkg-figure8', name: '扎线8字', category: '包装方式', subCategory: '扎线', svgPreview: pkgWrapSvg('figure8-labeled') },
  { id: 'pkg-pe-bag', name: '单根线包装自封口PE袋 - 大号', category: '包装方式', subCategory: '包装袋', svgPreview: pkgWrapSvg('pe-bag') },
  { id: 'pkg-circle-both', name: '圆形扎线-两边扎线', category: '包装方式', subCategory: '扎线', svgPreview: pkgWrapSvg('circle') },
  { id: 'pkg-figure8-ferrite', name: '8字形扎线-带磁环-两头露出', category: '包装方式', subCategory: '扎线', svgPreview: pkgWrapSvg('figure8') },
  { id: 'pkg-figure8-tin', name: '8字形扎线-带磁环-尾部上锡', category: '包装方式', subCategory: '扎线', svgPreview: pkgWrapSvg('figure8-tin') },
  { id: 'pkg-figure8-ferrite-sr', name: '8字形扎线-带磁环+SR-两头露出', category: '包装方式', subCategory: '扎线', svgPreview: pkgWrapSvg('figure8-ferrite-sr') },
  { id: 'pkg-figure8-usb', name: '8字形扎线-USB带卡位', category: '包装方式', subCategory: '扎线', svgPreview: pkgWrapSvg('figure8-ferrite-sr') },
  { id: 'pkg-figure8-2', name: '8字形扎线2', category: '包装方式', subCategory: '扎线', svgPreview: pkgWrapSvg('figure8') },
  { id: 'pkg-figure8-ac', name: '8字形扎线-A到C', category: '包装方式', subCategory: '扎线', svgPreview: pkgWrapSvg('figure8') },
  { id: 'pkg-figure8-lr', name: '8字形扎线-左头右尾', category: '包装方式', subCategory: '扎线', svgPreview: pkgWrapSvg('figure8-tin') },
  { id: 'pkg-figure8-1', name: '8字形扎线-1', category: '包装方式', subCategory: '扎线', svgPreview: pkgWrapSvg('figure8') },
  { id: 'pkg-carton', name: '纸箱', category: '包装方式', subCategory: '包装箱', svgPreview: pkgWrapSvg('carton') },
  { id: 'pkg-waterproof-bag', name: '防水袋', category: '包装方式', subCategory: '包装袋', svgPreview: pkgWrapSvg('waterproof-bag') },
  { id: 'pkg-pe-small', name: '独立PE袋包装 - 小号', category: '包装方式', subCategory: '包装袋', svgPreview: pkgWrapSvg('pe-bag') },
  { id: 'pkg-figure8-double', name: '8字形双扎带捆扎', category: '包装方式', subCategory: '扎线', svgPreview: pkgWrapSvg('figure8') },

  { id: 'irr-sleeve-taper', name: '套管', category: '不规则图型', subCategory: '护套/套管', svgPreview: '<svg viewBox="0 0 180 90" xmlns="http://www.w3.org/2000/svg"><polygon points="24,34 52,34 156,22 156,68 52,56 24,56" fill="#0f172a"/></svg>' },
  { id: 'irr-usb-braided', name: 'USB编织线示意', category: '不规则图型', subCategory: '外线整图', svgPreview: pkgWrapSvg('figure8-ferrite-sr') },
  { id: 'irr-phb2', name: 'PHB2 分支线束', category: '不规则图型', subCategory: '分支线束', svgPreview: '<svg viewBox="0 0 180 90" xmlns="http://www.w3.org/2000/svg"><rect x="20" y="38" width="60" height="14" fill="#1e293b"/><path d="M80 42 L140 24 M80 45 L140 45 M80 48 L140 66" stroke="#334155" stroke-width="2"/><rect x="140" y="18" width="22" height="12" fill="none" stroke="#334155" stroke-width="1.2"/><rect x="140" y="60" width="22" height="12" fill="none" stroke="#334155" stroke-width="1.2"/></svg>' },

  { id: 'proc-strip-note', name: '剥皮上锡工艺图型', category: '工艺说明', subCategory: '剥头工艺', svgPreview: '<svg viewBox="0 0 180 90" xmlns="http://www.w3.org/2000/svg"><rect x="20" y="36" width="80" height="18" fill="#334155"/><line x1="100" y1="40" x2="140" y2="40" stroke="#dc2626" stroke-width="2.5"/><line x1="100" y1="50" x2="140" y2="50" stroke="#111827" stroke-width="2.5"/><rect x="140" y="38" width="16" height="4" fill="#cbd5e1" stroke="#475569" stroke-width="0.6"/><rect x="140" y="48" width="16" height="4" fill="#cbd5e1" stroke="#475569" stroke-width="0.6"/></svg>' },
  { id: 'cut-single', name: '单芯裁线图型', category: '裁线图型', subCategory: '裁线', svgPreview: '<svg viewBox="0 0 180 90" xmlns="http://www.w3.org/2000/svg"><line x1="25" y1="45" x2="155" y2="45" stroke="#1e293b" stroke-width="3"/><line x1="25" y1="26" x2="155" y2="26" stroke="#475569" stroke-width="1"/><text x="90" y="22" text-anchor="middle" font-size="8" fill="#1e293b">L±5mm</text></svg>' },
  { id: 'wire-shielded', name: '屏蔽多芯线材图型', category: '线材图型', subCategory: '屏蔽线', svgPreview: '<svg viewBox="0 0 180 90" xmlns="http://www.w3.org/2000/svg"><rect x="25" y="35" width="130" height="20" rx="3" fill="#f8fafc" stroke="#1e293b" stroke-width="1.5"/><line x1="35" y1="41" x2="145" y2="41" stroke="#dc2626" stroke-width="2"/><line x1="35" y1="49" x2="145" y2="49" stroke="#111827" stroke-width="2"/></svg>' },
  { id: 'aux-ferrite', name: '抗干扰磁环图型', category: '辅材图型', subCategory: '磁环', svgPreview: '<svg viewBox="0 0 180 90" xmlns="http://www.w3.org/2000/svg"><rect x="60" y="25" width="60" height="40" rx="6" fill="#eef2ff" stroke="#334155" stroke-width="1.5"/><line x1="20" y1="45" x2="60" y2="45" stroke="#1e293b" stroke-width="3"/><line x1="120" y1="45" x2="160" y2="45" stroke="#1e293b" stroke-width="3"/></svg>' },
  { id: 'spec-rohs', name: '材料环保与公差规格', category: '物料规格', subCategory: '通用规格', svgPreview: '<svg viewBox="0 0 180 90" xmlns="http://www.w3.org/2000/svg"><rect x="24" y="18" width="132" height="54" rx="4" fill="#fff" stroke="#64748b" stroke-width="1"/><text x="34" y="36" font-size="9" fill="#1e293b">1. 符合 RoHS 标准</text><text x="34" y="54" font-size="9" fill="#475569">2. 100% 导通测试</text></svg>' },
  { id: 'section-4c', name: '四芯护套线截面图', category: '线材截面图', subCategory: '截面图', svgPreview: '<svg viewBox="0 0 180 90" xmlns="http://www.w3.org/2000/svg"><circle cx="90" cy="45" r="28" fill="#f1f5f9" stroke="#1e293b" stroke-width="1.8"/><circle cx="78" cy="35" r="8" fill="#dc2626"/><circle cx="102" cy="35" r="8" fill="#ffffff" stroke="#334155"/><circle cx="78" cy="55" r="8" fill="#16a34a"/><circle cx="102" cy="55" r="8" fill="#111827"/></svg>' },
];

export function listStaticDrawingComponentGraphics(category?: DrawingComponentGraphicCategory): DrawingComponentGraphic[] {
  return DRAWING_COMPONENT_GRAPHICS
    .filter((item) => !category || item.category === category)
    .map((item) => ({ ...item }));
}

