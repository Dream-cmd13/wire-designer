import type { DrawingIconResource } from '@/types/drawing';

export const DRAWING_ICON_CATEGORIES = [
  '箭头',
  '数学符号',
  '单位',
  '公差',
  '电气',
  '连接器',
  '线束',
  '端子',
  '几何图形',
] as const;

const icon = (id: string, name: string, category: string, svgPath: string): DrawingIconResource => ({
  id,
  name,
  category,
  svgPath,
  defaultWidth: 24,
  defaultHeight: 24,
});

export const LOCAL_DRAWING_ICONS: DrawingIconResource[] = [
  icon('arrow-right', '右向箭头', '箭头', 'M3 12h15M13 6l6 6-6 6'),
  icon('arrow-left', '左向箭头', '箭头', 'M21 12H6M11 6l-6 6 6 6'),
  icon('arrow-up-down', '上下箭头', '箭头', 'M12 3v18M6 9l6-6 6 6M6 15l6 6 6-6'),
  icon('arrow-leader', '引出箭头', '箭头', 'M4 20L18 6M12 6h6v6'),

  icon('math-plus', '加号', '数学符号', 'M12 5v14M5 12h14'),
  icon('math-minus', '减号', '数学符号', 'M5 12h14'),
  icon('math-multiply', '乘号', '数学符号', 'M6 6l12 12M18 6 6 18'),
  icon('math-equals', '等号', '数学符号', 'M5 9h14M5 15h14'),

  icon('unit-mm', '毫米 mm', '单位', 'M4 7h16M4 17h16M7 5v4M12 5v4M17 5v4M7 15v4M12 15v4M17 15v4'),
  icon('unit-degree', '角度 °', '单位', 'M8 17a4 4 0 1 1 8 0M8 17h8M12 13v-6'),
  icon('unit-diameter', '直径 Ø', '单位', 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M6 18L18 6'),
  icon('unit-radius', '半径 R', '单位', 'M5 19a10 10 0 0 1 10-10M15 9h5v5'),

  icon('tolerance-plus-minus', '正负公差', '公差', 'M12 3v9M8 8h8M5 18h14'),
  icon('tolerance-limit', '极限公差', '公差', 'M5 5h14v14H5zM8 12h8'),
  icon('tolerance-surface', '表面公差', '公差', 'M4 18h16M6 18l6-12 6 12'),
  icon('tolerance-center', '中心线', '公差', 'M3 12h18M12 3v18'),

  icon('electrical-ground', '接地', '电气', 'M12 3v10M6 13h12M8 17h8M10 21h4'),
  icon('electrical-battery', '电池', '电气', 'M4 8h16v8H4zM9 5v6M15 5v6'),
  icon('electrical-resistor', '电阻', '电气', 'M2 12h4l2-4 4 8 4-8 2 4h4'),
  icon('electrical-switch', '开关', '电气', 'M4 12h6l4-5M14 19h6'),

  icon('connector-male', '公连接器', '连接器', 'M4 5h16v14H4zM8 9v6M12 9v6M16 9v6'),
  icon('connector-female', '母连接器', '连接器', 'M4 7h16v10H4zM8 11h2M13 11h2'),
  icon('connector-pin-array', '针脚阵列', '连接器', 'M6 5v14M10 5v14M14 5v14M18 5v14'),
  icon('connector-plug', '插头', '连接器', 'M4 8h10v8H4zM14 10h6v4h-6'),

  icon('harness-bundle', '线束束线', '线束', 'M3 8c5 0 5 8 10 8s5-8 8-8M3 12c5 0 5 8 10 8s5-8 8-8'),
  icon('harness-branch', '线束分支', '线束', 'M4 19l7-7m0 0 7-7m-7 7H4m7 0h9'),
  icon('harness-shield', '屏蔽线', '线束', 'M3 12h18M6 8l4 4-4 4M14 8l4 4-4 4'),
  icon('harness-splice', '线束接续', '线束', 'M3 12h18M9 7l6 10M15 7l-6 10'),

  icon('terminal-ring', '环形端子', '端子', 'M6 12a6 6 0 1 0 12 0a6 6 0 1 0-12 0M18 12h4'),
  icon('terminal-blade', '片式端子', '端子', 'M4 8h14v8H4zM18 10h3v4h-3'),
  icon('terminal-crimp', '压接端子', '端子', 'M4 5h16v14H4zM8 9h8v6H8z'),
  icon('terminal-pin', '针式端子', '端子', 'M4 12h16M8 8v8M12 8v8M16 8v8'),

  icon('geometry-rectangle', '矩形', '几何图形', 'M4 4h16v16H4z'),
  icon('geometry-circle', '圆形', '几何图形', 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16'),
  icon('geometry-triangle', '三角形', '几何图形', 'M12 4l8 16H4z'),
  icon('geometry-crosshair', '十字中心', '几何图形', 'M3 12h18M12 3v18'),
];
