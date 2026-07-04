import { parseHarnessConfig } from '@/lib/harnessConfigSchema';
import { validateHarness } from '@/lib/validation';
import type { HarnessConfig } from '@/types/harness';
import type { Project } from '@/types/user';

const FORMAT = 'wire-harness-design';
const FORMAT_VERSION = 1;

export interface DesignFilePreview {
  name: string;
  description: string;
  config: HarnessConfig;
  errorCount: number;
  warningCount: number;
}

export type DesignFileParseResult =
  | { success: true; preview: DesignFilePreview }
  | { success: false; message: string; issues?: string[] };

export function createDesignFile(project: Project, config: HarnessConfig) {
  const issues = validateHarness(config);
  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    project: {
      name: project.name,
      description: project.description,
    },
    document: config,
    validation: {
      errors: issues.filter((issue) => issue.severity === 'error').length,
      warnings: issues.filter((issue) => issue.severity === 'warning').length,
    },
  };
}

export function parseDesignFile(input: unknown): DesignFileParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { success: false, message: '文件根节点必须是对象。' };
  }
  const raw = input as Record<string, unknown>;
  const isEnvelope = raw.format === FORMAT && raw.formatVersion === FORMAT_VERSION;
  const document = isEnvelope ? raw.document : raw;
  const parsed = parseHarnessConfig(document);
  if (!parsed.success) {
    return {
      success: false,
      message: '设计文件结构校验失败，未对现有项目做任何修改。',
      issues: parsed.issues,
    };
  }
  const project = isEnvelope && raw.project && typeof raw.project === 'object'
    ? raw.project as Record<string, unknown>
    : {};
  const issues = validateHarness(parsed.data);
  return {
    success: true,
    preview: {
      name: typeof project.name === 'string' && project.name.trim()
        ? project.name.trim()
        : parsed.data.name,
      description: typeof project.description === 'string' ? project.description : '从设计文件导入',
      config: parsed.data,
      errorCount: issues.filter((issue) => issue.severity === 'error').length,
      warningCount: issues.filter((issue) => issue.severity === 'warning').length,
    },
  };
}

export function downloadTextFile(content: string, filename: string, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function safeFilename(name: string) {
  const normalized = Array.from(name.trim())
    .map((character) => character.charCodeAt(0) < 32 ? '-' : character)
    .join('')
    .replace(/[<>:"/\\|?*]/g, '-');
  return normalized || 'wire-harness-design';
}
