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

const DRAWING_ICONS = [
  { id: '30000000-0000-4000-8000-000000005001', name: '接地', category: '电气', svgPath: 'M12 2v20M12 2v18M7 13h10', defaultWidth: 24, defaultHeight: 24 },
  { id: '30000000-0000-4000-8000-000000005002', name: '警告', category: '标识', svgPath: 'M12 2L22 20H2zM12 8v5M12 17h.01', defaultWidth: 24, defaultHeight: 24 },
  { id: '30000000-0000-4000-8000-000000005003', name: '上锡', category: '工艺', svgPath: 'M4 12h16M8 8v8M16 8v8', defaultWidth: 24, defaultHeight: 24 },
  { id: '30000000-0000-4000-8000-000000005004', name: '屏蔽', category: '电气', svgPath: 'M4 4h16v16H4zM8 8h8v8H8z', defaultWidth: 24, defaultHeight: 24 },
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
