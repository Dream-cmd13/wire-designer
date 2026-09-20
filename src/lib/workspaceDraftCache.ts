import { isDrawingDocument } from '@/lib/drawingDocumentSchema';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
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

export interface CorruptWorkspaceDraft {
  ownerId: string;
  kind: WorkspaceDraftKind;
  documentId: string;
  raw: string;
  savedAt: number | null;
  quarantinedAt: number | null;
  isolated: boolean;
  key: string;
}

const DRAFT_KEY_PREFIX = 'wh_draft_v1';
const CORRUPT_DRAFT_KEY_PREFIX = 'wh_draft_corrupt_v1';

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

function isValidDraftDocument(kind: WorkspaceDraftKind, value: unknown): boolean {
  return kind === 'project' ? isHarnessConfigDocument(value) : isDrawingDocument(value);
}

function parseRawRecord(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseDraft(raw: string, ownerId: string, kind: WorkspaceDraftKind, documentId: string): WorkspaceDraft | null {
  const parsed = parseRawRecord(raw);
  if (!parsed) return null;
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

function listStorageKeys(): string[] {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key) keys.push(key);
  }
  return keys;
}

function corruptDraftStorageKey(ownerId: string, kind: WorkspaceDraftKind, documentId: string): string {
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${CORRUPT_DRAFT_KEY_PREFIX}:${ownerId}:${kind}:${documentId}:${unique}`;
}

function quarantineStoredRaw(ownerId: string, kind: WorkspaceDraftKind, documentId: string, raw: string): boolean {
  const parsed = parseRawRecord(raw);
  const record = {
    version: 1,
    ownerId,
    kind,
    documentId,
    raw,
    savedAt: parsed && typeof parsed.savedAt === 'number' ? parsed.savedAt : null,
    quarantinedAt: Date.now(),
  };
  try {
    localStorage.setItem(corruptDraftStorageKey(ownerId, kind, documentId), JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

function isolateCorruptStoredDraft(
  ownerId: string,
  kind: WorkspaceDraftKind,
  documentId: string,
): boolean {
  let raw: string | null;
  try {
    raw = localStorage.getItem(workspaceDraftKey(ownerId, kind, documentId));
  } catch {
    return true;
  }
  if (raw === null || parseDraft(raw, ownerId, kind, documentId)) return true;
  if (!quarantineStoredRaw(ownerId, kind, documentId, raw)) return false;
  try {
    localStorage.removeItem(workspaceDraftKey(ownerId, kind, documentId));
    return true;
  } catch {
    return false;
  }
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
  if (draft) return draft;
  isolateCorruptStoredDraft(ownerId, kind, documentId);
  return null;
}

export function listCorruptWorkspaceDrafts(
  ownerId: string,
  kind: WorkspaceDraftKind,
): CorruptWorkspaceDraft[] {
  const draftPrefix = `${DRAFT_KEY_PREFIX}:${ownerId}:${kind}:`;
  const corruptPrefix = `${CORRUPT_DRAFT_KEY_PREFIX}:${ownerId}:${kind}:`;
  const drafts: CorruptWorkspaceDraft[] = [];
  try {
    for (const key of listStorageKeys()) {
      if (!key.startsWith(draftPrefix)) continue;
      const documentId = key.slice(draftPrefix.length);
      if (isolateCorruptStoredDraft(ownerId, kind, documentId)) continue;
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      const record = parseRawRecord(raw);
      drafts.push({
        ownerId,
        kind,
        documentId,
        raw,
        savedAt: record && typeof record.savedAt === 'number' ? record.savedAt : null,
        quarantinedAt: null,
        isolated: false,
        key,
      });
    }
    for (const key of listStorageKeys()) {
      if (!key.startsWith(corruptPrefix)) continue;
      const rawValue = localStorage.getItem(key);
      const record = rawValue === null ? null : parseRawRecord(rawValue);
      if (!record) continue;
      if (
        record.ownerId !== ownerId
        || record.kind !== kind
        || typeof record.documentId !== 'string'
        || typeof record.raw !== 'string'
      ) {
        continue;
      }
      drafts.push({
        ownerId,
        kind,
        documentId: record.documentId,
        raw: record.raw,
        savedAt: typeof record.savedAt === 'number' ? record.savedAt : null,
        quarantinedAt: typeof record.quarantinedAt === 'number' ? record.quarantinedAt : 0,
        isolated: true,
        key,
      });
    }
  } catch {
    return drafts;
  }
  return drafts;
}

function storedValueMatchesCorruptDraft(draft: CorruptWorkspaceDraft): boolean {
  const current = localStorage.getItem(draft.key);
  if (current === null) return false;
  if (!draft.isolated) return current === draft.raw;
  const record = parseRawRecord(current);
  return record !== null && record.raw === draft.raw;
}

export function removeCorruptWorkspaceDraft(draft: CorruptWorkspaceDraft): boolean {
  try {
    if (!storedValueMatchesCorruptDraft(draft)) return false;
    localStorage.removeItem(draft.key);
    return true;
  } catch {
    return false;
  }
}

export function corruptWorkspaceDraftsToJson(drafts: CorruptWorkspaceDraft[]): string {
  return JSON.stringify(
    drafts.map(({ kind, documentId, savedAt, isolated, raw, quarantinedAt }) => ({
      kind,
      documentId,
      savedAt,
      isolated,
      quarantinedAt,
      raw,
    })),
    null,
    2,
  );
}

export function writeWorkspaceDraft(
  draft: Omit<WorkspaceDraft, 'version' | 'savedAt'>,
): DraftWriteResult {
  if (!isolateCorruptStoredDraft(draft.ownerId, draft.kind, draft.documentId)) {
    return { ok: false, error: '检测到损坏的本地草稿且隔离失败，已保留原始内容。' };
  }
  const payload: WorkspaceDraft = { version: 1, savedAt: Date.now(), ...draft };
  try {
    localStorage.setItem(workspaceDraftKey(draft.ownerId, draft.kind, draft.documentId), JSON.stringify(payload));
    return { ok: true };
  } catch (error) {
    console.error('本地草稿写入失败:', error);
    return {
      ok: false,
      error: getUserErrorMessage(error, '未能在此设备上备份最新修改，请保持页面打开并尝试保存。'),
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
    for (const key of listStorageKeys()) {
      if (!key.startsWith(prefix)) continue;
      const draft = readWorkspaceDraft(ownerId, kind, key.slice(prefix.length));
      if (draft) drafts.push(draft);
    }
  } catch {
    return drafts;
  }
  return drafts;
}
