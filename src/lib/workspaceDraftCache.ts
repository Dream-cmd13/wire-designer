import type { DrawingDocument } from '@/types/drawing';
import type { HarnessConfig } from '@/types/harness';

export type WorkspaceDraftKind = 'project' | 'drawing';

export interface WorkspaceDraft {
  version: 1;
  ownerId: string;
  kind: WorkspaceDraftKind;
  documentId: string;
  revision: number;
  baseUpdatedAt: number;
  savedAt: number;
  document: HarnessConfig | DrawingDocument;
}

export interface DraftWriteResult {
  ok: boolean;
  error?: string;
}

const DRAFT_KEY_PREFIX = 'wh_draft_v1';

export function workspaceDraftKey(ownerId: string, kind: WorkspaceDraftKind, documentId: string): string {
  return `${DRAFT_KEY_PREFIX}:${ownerId}:${kind}:${documentId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isHarnessConfigDocument(value: unknown): value is HarnessConfig {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.updatedAt === 'number'
    && Array.isArray(value.connectors)
    && Array.isArray(value.materials)
    && Array.isArray(value.protectiveSleeves)
    && Array.isArray(value.models);
}

function isDrawingDocument(value: unknown): value is DrawingDocument {
  return isRecord(value)
    && value.schemaVersion === 1
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.updatedAt === 'number'
    && Array.isArray(value.objects);
}

function isValidDraftDocument(kind: WorkspaceDraftKind, value: unknown): boolean {
  return kind === 'project' ? isHarnessConfigDocument(value) : isDrawingDocument(value);
}

function parseDraft(raw: string, ownerId: string, kind: WorkspaceDraftKind, documentId: string): WorkspaceDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (
    parsed.version !== 1
    || parsed.ownerId !== ownerId
    || parsed.kind !== kind
    || parsed.documentId !== documentId
    || typeof parsed.revision !== 'number'
    || typeof parsed.baseUpdatedAt !== 'number'
    || typeof parsed.savedAt !== 'number'
    || !isValidDraftDocument(kind, parsed.document)
  ) {
    return null;
  }
  return parsed as unknown as WorkspaceDraft;
}

export function readWorkspaceDraft(
  ownerId: string,
  kind: WorkspaceDraftKind,
  documentId: string,
): WorkspaceDraft | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(workspaceDraftKey(ownerId, kind, documentId));
  } catch {
    return null;
  }
  if (raw === null) return null;
  const draft = parseDraft(raw, ownerId, kind, documentId);
  if (!draft) {
    removeWorkspaceDraft(ownerId, kind, documentId);
    return null;
  }
  return draft;
}

export function writeWorkspaceDraft(
  draft: Omit<WorkspaceDraft, 'version' | 'savedAt'>,
): DraftWriteResult {
  const payload: WorkspaceDraft = { version: 1, savedAt: Date.now(), ...draft };
  try {
    localStorage.setItem(workspaceDraftKey(draft.ownerId, draft.kind, draft.documentId), JSON.stringify(payload));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '本地草稿写入失败。',
    };
  }
}

export function removeWorkspaceDraft(ownerId: string, kind: WorkspaceDraftKind, documentId: string): void {
  try {
    localStorage.removeItem(workspaceDraftKey(ownerId, kind, documentId));
  } catch {
    // 存储不可用时没有可清理的内容。
  }
}

export function removeWorkspaceDraftIfRevisionAtMost(
  ownerId: string,
  kind: WorkspaceDraftKind,
  documentId: string,
  revision: number,
): boolean {
  const draft = readWorkspaceDraft(ownerId, kind, documentId);
  if (!draft || draft.revision > revision) return false;
  removeWorkspaceDraft(ownerId, kind, documentId);
  return true;
}

export function canApplyWorkspaceDraft(
  draft: Pick<WorkspaceDraft, 'ownerId' | 'documentId'>,
  context: { ownerId: string | null; documentId: string | null },
): boolean {
  return Boolean(context.ownerId)
    && context.ownerId === draft.ownerId
    && context.documentId === draft.documentId;
}

export function listWorkspaceDrafts(ownerId: string, kind: WorkspaceDraftKind): WorkspaceDraft[] {
  const prefix = `${DRAFT_KEY_PREFIX}:${ownerId}:${kind}:`;
  const drafts: WorkspaceDraft[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(prefix)) continue;
      const draft = readWorkspaceDraft(ownerId, kind, key.slice(prefix.length));
      if (draft) drafts.push(draft);
    }
  } catch {
    return drafts;
  }
  return drafts;
}
