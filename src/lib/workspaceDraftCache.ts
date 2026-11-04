import { isDrawingDocument } from '@/lib/drawingDocumentSchema';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import type { DrawingDocument } from '@/types/drawing';
import type { HarnessConfig } from '@/types/harness';

export type WorkspaceDraftKind = 'project' | 'drawing';

export interface WorkspaceDraft {
  version: 2;
  ownerId: string;
  kind: WorkspaceDraftKind;
  documentId: string;
  /** 草稿唯一标识；删除草稿必须按 draftId，避免误删其他窗口的草稿。 */
  draftId: string;
  /** 窗口/标签页实例标识：每个实例只写自己的键，互不覆盖。 */
  instanceId: string;
  /** 本地递增修订号，仅在同一实例内可比。 */
  localRevision: number;
  /** 草稿基于的云端 revision；null 表示没有可确认的云端基线（本地新建或旧版草稿）。 */
  baseServerRevision: number | null;
  savedAt: number;
  document: HarnessConfig | DrawingDocument;
}

export interface DraftWriteInput {
  ownerId: string;
  kind: WorkspaceDraftKind;
  documentId: string;
  localRevision: number;
  baseServerRevision: number | null;
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

const DRAFT_KEY_PREFIX = 'wh_draft_v2';
const LEGACY_DRAFT_KEY_PREFIX = 'wh_draft_v1';
const CORRUPT_DRAFT_KEY_PREFIX = 'wh_draft_corrupt_v1';

let moduleInstanceId: string | null = null;

function randomId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 每次页面运行使用独立实例；sessionStorage 会被复制标签页继承，不能作为窗口身份。旧草稿仍保留为恢复候选。 */
export function currentDraftInstanceId(): string {
  if (!moduleInstanceId) moduleInstanceId = randomId();
  return moduleInstanceId;
}

export function workspaceDraftKey(
  ownerId: string,
  kind: WorkspaceDraftKind,
  documentId: string,
  instanceId: string = currentDraftInstanceId(),
): string {
  return `${DRAFT_KEY_PREFIX}:${ownerId}:${kind}:${documentId}:${instanceId}`;
}

function legacyDraftKey(ownerId: string, kind: WorkspaceDraftKind, documentId: string): string {
  return `${LEGACY_DRAFT_KEY_PREFIX}:${ownerId}:${kind}:${documentId}`;
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

function parseDraftV2(raw: string, ownerId: string, kind: WorkspaceDraftKind, documentId: string): WorkspaceDraft | null {
  const parsed = parseRawRecord(raw);
  if (!parsed) return null;
  if (
    parsed.version !== 2
    || parsed.ownerId !== ownerId
    || parsed.kind !== kind
    || parsed.documentId !== documentId
    || typeof parsed.draftId !== 'string'
    || typeof parsed.instanceId !== 'string'
    || typeof parsed.localRevision !== 'number'
    || !(parsed.baseServerRevision === null || typeof parsed.baseServerRevision === 'number')
    || typeof parsed.savedAt !== 'number'
    || !isValidDraftDocument(kind, parsed.document)
  ) {
    return null;
  }
  return parsed as unknown as WorkspaceDraft;
}

/** 旧版 v1 草稿：保留为恢复候选，基线不可确认，不参与自动清理。 */
function parseLegacyDraftV1(raw: string, ownerId: string, kind: WorkspaceDraftKind, documentId: string): WorkspaceDraft | null {
  const parsed = parseRawRecord(raw);
  if (!parsed) return null;
  if (
    parsed.version !== 1
    || parsed.ownerId !== ownerId
    || parsed.kind !== kind
    || parsed.documentId !== documentId
    || typeof parsed.revision !== 'number'
    || typeof parsed.savedAt !== 'number'
    || !isValidDraftDocument(kind, parsed.document)
  ) {
    return null;
  }
  return {
    version: 2,
    ownerId,
    kind,
    documentId,
    draftId: 'legacy-v1',
    instanceId: 'legacy-v1',
    localRevision: parsed.revision,
    baseServerRevision: null,
    savedAt: parsed.savedAt,
    document: parsed.document as HarnessConfig | DrawingDocument,
  };
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

function parseDraftAtKey(raw: string, ownerId: string, kind: WorkspaceDraftKind, documentId: string): WorkspaceDraft | null {
  return parseDraftV2(raw, ownerId, kind, documentId) ?? parseLegacyDraftV1(raw, ownerId, kind, documentId);
}

/** 读取指定键；损坏时隔离到隔离区并返回 null。 */
function readDraftAtKey(key: string, ownerId: string, kind: WorkspaceDraftKind, documentId: string): WorkspaceDraft | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const draft = parseDraftAtKey(raw, ownerId, kind, documentId);
  if (draft) return draft;
  isolateCorruptStoredDraft(ownerId, kind, documentId, key, raw);
  return null;
}

function isolateCorruptStoredDraft(
  ownerId: string,
  kind: WorkspaceDraftKind,
  documentId: string,
  key: string,
  raw: string,
): boolean {
  if (!quarantineStoredRaw(ownerId, kind, documentId, raw)) return false;
  try {
    const current = localStorage.getItem(key);
    if (current !== raw) return true;
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function draftPrefix(ownerId: string, kind: WorkspaceDraftKind): string {
  return `${DRAFT_KEY_PREFIX}:${ownerId}:${kind}:`;
}

function legacyPrefix(ownerId: string, kind: WorkspaceDraftKind): string {
  return `${LEGACY_DRAFT_KEY_PREFIX}:${ownerId}:${kind}:`;
}

function documentIdFromKey(key: string, prefix: string): string {
  const rest = key.slice(prefix.length);
  const separator = rest.indexOf(':');
  return separator === -1 ? rest : rest.slice(0, separator);
}

export function listWorkspaceDrafts(
  ownerId: string,
  kind: WorkspaceDraftKind,
  documentId?: string,
): WorkspaceDraft[] {
  const drafts: WorkspaceDraft[] = [];
  try {
    const prefix = draftPrefix(ownerId, kind);
    for (const key of listStorageKeys()) {
      if (!key.startsWith(prefix)) continue;
      const keyDocumentId = documentIdFromKey(key, prefix);
      if (documentId && keyDocumentId !== documentId) continue;
      const draft = readDraftAtKey(key, ownerId, kind, keyDocumentId);
      if (draft) drafts.push(draft);
    }
    const legacy = legacyPrefix(ownerId, kind);
    for (const key of listStorageKeys()) {
      if (!key.startsWith(legacy)) continue;
      const keyDocumentId = documentIdFromKey(key, legacy);
      if (documentId && keyDocumentId !== documentId) continue;
      const draft = readDraftAtKey(key, ownerId, kind, keyDocumentId);
      if (draft) drafts.push(draft);
    }
  } catch {
    return drafts.sort((left, right) => right.savedAt - left.savedAt);
  }
  return drafts.sort((left, right) => right.savedAt - left.savedAt);
}

/** 读取指定文档最新的草稿候选（多窗口时取保存时间最新的一份）。 */
export function readWorkspaceDraft(
  ownerId: string,
  kind: WorkspaceDraftKind,
  documentId: string,
): WorkspaceDraft | null {
  return listWorkspaceDrafts(ownerId, kind, documentId)[0] ?? null;
}

export function listCorruptWorkspaceDrafts(
  ownerId: string,
  kind: WorkspaceDraftKind,
): CorruptWorkspaceDraft[] {
  const quarantinePrefix = `${CORRUPT_DRAFT_KEY_PREFIX}:${ownerId}:${kind}:`;
  const drafts: CorruptWorkspaceDraft[] = [];
  try {
    const livePrefixes = [draftPrefix(ownerId, kind), legacyPrefix(ownerId, kind)];
    for (const key of listStorageKeys()) {
      const prefix = livePrefixes.find((candidate) => key.startsWith(candidate));
      if (!prefix) continue;
      const documentId = documentIdFromKey(key, prefix);
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      if (parseDraftAtKey(raw, ownerId, kind, documentId)) continue;
      if (isolateCorruptStoredDraft(ownerId, kind, documentId, key, raw)) continue;
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
      if (!key.startsWith(quarantinePrefix)) continue;
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

export function writeWorkspaceDraft(input: DraftWriteInput): DraftWriteResult {
  const instanceId = currentDraftInstanceId();
  const key = workspaceDraftKey(input.ownerId, input.kind, input.documentId, instanceId);
  // 本实例已有损坏记录时先隔离，不影响其他实例的草稿。
  let existing: string | null;
  try {
    existing = localStorage.getItem(key);
  } catch {
    return { ok: false, error: '浏览器阻止了本机存储，未能备份最新修改，请检查浏览器隐私设置后重试。' };
  }
  if (existing !== null) {
    const parsed = parseDraftAtKey(existing, input.ownerId, input.kind, input.documentId);
    if (!parsed && !quarantineStoredRaw(input.ownerId, input.kind, input.documentId, existing)) {
      return { ok: false, error: '检测到损坏的本地草稿且隔离失败，已保留原始内容。' };
    }
  }
  const payload: WorkspaceDraft = {
    version: 2,
    ownerId: input.ownerId,
    kind: input.kind,
    documentId: input.documentId,
    draftId: randomId(),
    instanceId,
    localRevision: input.localRevision,
    baseServerRevision: input.baseServerRevision,
    savedAt: Date.now(),
    document: input.document,
  };
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (error) {
    console.error('本地草稿写入失败:', error);
    return {
      ok: false,
      error: getUserErrorMessage(error, '未能在此设备上备份最新修改，请保持页面打开并尝试保存。'),
    };
  }
  // 旧版 v1 草稿必须由用户在恢复提示中明确“恢复”或“丢弃”后才清理，
  // 写入新草稿不能顺带删除尚未处理的旧候选。
  return { ok: true };
}

/**
 * 删除草稿：指定 draftId 时只删除该候选（可能是其他窗口的，需要用户明确同意）；
 * 不指定时删除当前实例的草稿，其他窗口草稿保持不变。
 */
export function removeWorkspaceDraft(
  ownerId: string,
  kind: WorkspaceDraftKind,
  documentId: string,
  draftId?: string,
): void {
  try {
    // 指定旧版草稿时只删除旧键，不能连带删除同文档的 v2 候选。
    if (draftId === 'legacy-v1') {
      localStorage.removeItem(legacyDraftKey(ownerId, kind, documentId));
      return;
    }
    if (!draftId) {
      localStorage.removeItem(legacyDraftKey(ownerId, kind, documentId));
    }
    const prefix = draftPrefix(ownerId, kind);
    for (const key of listStorageKeys()) {
      if (!key.startsWith(prefix)) continue;
      if (documentIdFromKey(key, prefix) !== documentId) continue;
      if (draftId) {
        const raw = localStorage.getItem(key);
        const draft = raw === null ? null : parseDraftV2(raw, ownerId, kind, documentId);
        if (!draft || draft.draftId !== draftId) continue;
      } else {
        const raw = localStorage.getItem(key);
        const draft = raw === null ? null : parseDraftV2(raw, ownerId, kind, documentId);
        if (!draft || draft.instanceId !== currentDraftInstanceId()) continue;
      }
      localStorage.removeItem(key);
    }
  } catch {
    // 存储不可用时没有可清理的内容。
  }
}

/** 保存成功后只清理“当前实例且已确认保存”的草稿；其他窗口草稿不受影响。 */
export function removeWorkspaceDraftIfRevisionAtMost(
  ownerId: string,
  kind: WorkspaceDraftKind,
  documentId: string,
  revision: number,
): boolean {
  return removeWorkspaceDraftForInstance(ownerId, kind, documentId, currentDraftInstanceId(), revision);
}

export function removeWorkspaceDraftForInstance(
  ownerId: string,
  kind: WorkspaceDraftKind,
  documentId: string,
  instanceId: string,
  maxLocalRevision: number,
): boolean {
  if (!instanceId || instanceId === 'legacy-v1') return false;
  try {
    const key = workspaceDraftKey(ownerId, kind, documentId, instanceId);
    const raw = localStorage.getItem(key);
    if (raw === null) return false;
    const draft = parseDraftV2(raw, ownerId, kind, documentId);
    if (!draft || draft.localRevision > maxLocalRevision) return false;
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function canApplyWorkspaceDraft(
  draft: Pick<WorkspaceDraft, 'ownerId' | 'documentId'>,
  context: { ownerId: string | null; documentId: string | null },
): boolean {
  return Boolean(context.ownerId)
    && context.ownerId === draft.ownerId
    && context.documentId === draft.documentId;
}
