import type {
  DrawingCommonPhrase,
  DrawingDocument,
  DrawingIconResource,
  DrawingTemplateSummary,
} from '@/types/drawing';

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
] satisfies readonly DrawingTemplateSummary[];

const DRAWING_TEMPLATE_DOCUMENTS: Record<string, DrawingDocument> = {
  'template-single': drawingTemplate('template-single', '单头普通电子线模板', 'TPL-SINGLE'),
  'template-double': drawingTemplate('template-double', '双头四芯屏蔽线模板', 'TPL-DOUBLE'),
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

function drawingTemplate(id: string, name: string, drawingNo: string): DrawingDocument {
  return {
    schemaVersion: 1,
    id,
    name,
    createdAt: 0,
    updatedAt: 0,
    page: { size: 'A4', orientation: 'landscape', width: 1200, height: 800 },
    objects: [],
    titleBlock: { title: name, drawingNo, revision: 'A' },
    revisionTable: [],
    techRequirements: [],
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
