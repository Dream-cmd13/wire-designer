import { create } from 'zustand';
import type {
  CanvasModel,
  CanvasWireMaterial,
  ConnectorInstance,
  HarnessConfig,
  ProductionDrawingFrame,
  ProtectiveSleeve,
  SaveState,
  Selection,
} from '@/types/harness';
import { alignHarnessConfig } from '@/lib/canvasMaterials';
import { syncTwoDImages } from '@/lib/autoAssociateTwoDImages';
import { createDefaultDrawingFrame, ensureDrawingFrame } from '@/lib/drawingFrameDefaults';
import {
  generateId,
  removeConnector as removeConnectorCommand,
  removeMaterial as removeMaterialCommand,
  updateMaterial as updateMaterialCommand,
  updateProtectiveSleeve as updateProtectiveSleeveCommand,
} from '@/lib/commands';

export function createDefaultConfig(currentUser?: { name?: string } | null): HarnessConfig {
  const config: HarnessConfig = {
    schemaVersion: 3,
    id: generateId(),
    name: '新建线束',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    connectors: [],
    materials: [],
    protectiveSleeves: [],
    models: [],
    quantity: 1,
    leadTime: 'standard',
    twoDImages: [],
    drawingFrame: createDefaultDrawingFrame(currentUser),
  };

  return {
    ...config,
    twoDImages: syncTwoDImages(config),
  };
}

interface ReplaceDocumentOptions {
  markSaved?: boolean;
}

interface HarnessState {
  config: HarnessConfig;
  selection: Selection;
  saveState: SaveState;
  canvasViewport: { x: number; y: number; zoom: number } | null;
  twoDViewport: { zoom: number; pan: { x: number; y: number } } | null;
  /** 目录派生刷新的代数；用于区分“用户编辑”和“目录同步”引起的 config 变化。 */
  catalogSyncCount: number;
  /** 本地递增修订号：每次用户编辑/文档替换递增，用于草稿排序与保存确认。 */
  localRevision: number;
  setCanvasViewport: (viewport: { x: number; y: number; zoom: number } | null) => void;
  setTwoDViewport: (viewport: { zoom: number; pan: { x: number; y: number } } | null) => void;
  setConfig: (config: Partial<HarnessConfig>) => void;
  patchDocument: (partial: Partial<HarnessConfig>) => void;
  replaceDocument: (fullConfig: HarnessConfig, options?: ReplaceDocumentOptions) => void;
  /**
   * 目录数据（目录快照）变化后按现有对齐逻辑刷新引用与派生的 2D 图片。
   * 不是用户编辑：保留 selection、canvasViewport、twoDViewport 和 saveState；
   * 结果与当前文档一致时不写 store，避免制造伪编辑和无意义的 re-render。
   */
  refreshCatalogReferences: () => void;
  markSaving: () => void;
  markSaved: () => void;
  markSaveError: (message: string) => void;
  /** 保存请求返回时发现文档已被新的内容替换：从 saving 回到 dirty，等待下一轮保存。 */
  markDirty: () => void;

  // Connector actions
  addConnector: (connector: ConnectorInstance) => void;
  updateConnector: (id: string, updates: Partial<ConnectorInstance>) => void;
  removeConnector: (id: string) => void;

  // Material actions
  addMaterial: (material: CanvasWireMaterial) => void;
  updateMaterial: (id: string, updates: Partial<CanvasWireMaterial>) => void;
  removeMaterial: (id: string) => void;

  // Protective sleeve actions
  addProtectiveSleeve: (sleeve: ProtectiveSleeve) => void;
  updateProtectiveSleeve: (id: string, updates: Partial<ProtectiveSleeve>) => void;
  removeProtectiveSleeve: (id: string) => void;

  // Canvas model actions
  addModel: (model: CanvasModel) => void;
  updateModel: (id: string, updates: Partial<CanvasModel>) => void;
  removeModel: (id: string) => void;

  setSelection: (selection: Selection) => void;
  resetConfig: () => void;

  rotateTwoDImage: (id: string) => void;
  reorderTwoDImages: (fromIndex: number, toIndex: number) => void;
  moveTwoDImage: (id: string, x: number, y: number) => void;
  syncTwoDImagesAuto: () => void; // New: auto-sync 2D images
  updateDrawingFrame: (updates: Partial<ProductionDrawingFrame>) => void;
}

function dirtyState() {
  return { status: 'dirty' } as const;
}

export const useHarnessStore = create<HarnessState>()(
    (set, get) => ({
      config: createDefaultConfig(),
      selection: { kind: 'none' },
      saveState: { status: 'saved', savedAt: Date.now() },
      canvasViewport: null,
      twoDViewport: null,
      catalogSyncCount: 0,
      localRevision: 0,
      setCanvasViewport: (canvasViewport) => set({ canvasViewport }),
      setTwoDViewport: (twoDViewport) => set({ twoDViewport }),

      setConfig: (updates) =>
        set((state) => {
          const next = alignHarnessConfig({ ...state.config, ...updates, updatedAt: Date.now() }, state.selection);
          return {
            config: next,
            saveState: dirtyState(),
            localRevision: state.localRevision + 1,
          };
        }),

      patchDocument: (partial) =>
        set((state) => {
          const next = alignHarnessConfig({ ...state.config, ...partial, updatedAt: Date.now() }, state.selection);
          return {
            config: next,
            saveState: dirtyState(),
            localRevision: state.localRevision + 1,
          };
        }),

      replaceDocument: (fullConfig, options) => {
        const aligned = alignHarnessConfig(fullConfig);
        set({
          config: { ...aligned, twoDImages: syncTwoDImages(aligned) },
          selection: { kind: 'none' },
          canvasViewport: null,
          twoDViewport: null,
          saveState: options?.markSaved ? { status: 'saved', savedAt: Date.now() } : dirtyState(),
          localRevision: get().localRevision + 1,
        });
      },

      refreshCatalogReferences: () => {
        const state = get();
        const aligned = alignHarnessConfig(state.config);
        const nextConfig: HarnessConfig = { ...aligned, twoDImages: syncTwoDImages(aligned) };
        if (JSON.stringify(nextConfig) === JSON.stringify(state.config)) return;
        set({
          config: nextConfig,
          catalogSyncCount: state.catalogSyncCount + 1,
        });
      },

      markSaving: () => set({ saveState: { status: 'saving' } }),
      markSaved: () => set({ saveState: { status: 'saved', savedAt: Date.now() } }),
      markSaveError: (message) => set({ saveState: { status: 'error', message } }),
      markDirty: () => set((state) => (
        state.saveState.status === 'saving' ? { saveState: dirtyState() } : state
      )),

      addConnector: (connector) =>
        set((state) => {
          const nextConfig = alignHarnessConfig({
            ...state.config,
            connectors: [...state.config.connectors, connector],
            updatedAt: Date.now(),
          }, state.selection);
          return {
            config: { ...nextConfig, twoDImages: syncTwoDImages(nextConfig) },
            saveState: dirtyState(),
            localRevision: state.localRevision + 1,
          };
        }),

      updateConnector: (id, updates) =>
        set((state) => {
          const nextConfig = alignHarnessConfig({
            ...state.config,
            connectors: state.config.connectors.map((c) =>
              c.id === id ? { ...c, ...updates } : c,
            ),
            updatedAt: Date.now(),
          }, state.selection);
          return {
            config: { ...nextConfig, twoDImages: syncTwoDImages(nextConfig) },
            saveState: dirtyState(),
            localRevision: state.localRevision + 1,
          };
        }),

      removeConnector: (id) =>
        set((state) => {
          const nextSelection =
            state.selection.kind === 'connector' && state.selection.id === id
              ? ({ kind: 'none' } as const)
              : state.selection;

          const nextConfig = alignHarnessConfig(removeConnectorCommand(state.config, id), state.selection);
          return {
            config: { ...nextConfig, twoDImages: syncTwoDImages(nextConfig) },
            selection: nextSelection,
            saveState: dirtyState(),
            localRevision: state.localRevision + 1,
          };
        }),

      addMaterial: (material) =>
        set((state) => {
          const nextConfig = alignHarnessConfig({
            ...state.config,
            materials: [...state.config.materials, material],
            updatedAt: Date.now(),
          }, state.selection);
          return {
            config: { ...nextConfig, twoDImages: syncTwoDImages(nextConfig) },
            saveState: dirtyState(),
            localRevision: state.localRevision + 1,
          };
        }),

      updateMaterial: (id, updates) =>
        set((state) => {
          const nextConfig = alignHarnessConfig(updateMaterialCommand(state.config, id, updates), state.selection);
          return {
            config: { ...nextConfig, twoDImages: syncTwoDImages(nextConfig) },
            saveState: dirtyState(),
            localRevision: state.localRevision + 1,
          };
        }),

      removeMaterial: (id) =>
        set((state) => {
          const nextConfig = alignHarnessConfig(removeMaterialCommand(state.config, id), state.selection);
          return {
            config: { ...nextConfig, twoDImages: syncTwoDImages(nextConfig) },
            saveState: dirtyState(),
            localRevision: state.localRevision + 1,
          };
        }),

      addProtectiveSleeve: (sleeve) =>
        set((state) => {
          const nextConfig = alignHarnessConfig({
            ...state.config,
            protectiveSleeves: [...state.config.protectiveSleeves, sleeve],
            updatedAt: Date.now(),
          }, state.selection);
          return {
            config: nextConfig,
            saveState: dirtyState(),
            localRevision: state.localRevision + 1,
          };
        }),

      updateProtectiveSleeve: (id, updates) =>
        set((state) => {
          const nextConfig = alignHarnessConfig(updateProtectiveSleeveCommand(state.config, id, updates), state.selection);
          return {
            config: nextConfig,
            saveState: dirtyState(),
            localRevision: state.localRevision + 1,
          };
        }),

      removeProtectiveSleeve: (id) =>
        set((state) => {
          const nextConfig = alignHarnessConfig({
            ...state.config,
            protectiveSleeves: state.config.protectiveSleeves.filter((item) => item.id !== id),
            updatedAt: Date.now(),
          }, state.selection);
          return {
            config: nextConfig,
            saveState: dirtyState(),
            localRevision: state.localRevision + 1,
          };
        }),

      addModel: (model) =>
        set((state) => {
          const nextConfig = alignHarnessConfig({
            ...state.config,
            models: [...state.config.models, model],
            updatedAt: Date.now(),
          }, state.selection);
          return {
            config: { ...nextConfig, twoDImages: syncTwoDImages(nextConfig) },
            saveState: dirtyState(),
            localRevision: state.localRevision + 1,
          };
        }),

      updateModel: (id, updates) =>
        set((state) => {
          const nextConfig = alignHarnessConfig({
            ...state.config,
            models: state.config.models.map((item) =>
              item.id === id ? { ...item, ...updates } : item,
            ),
            updatedAt: Date.now(),
          }, state.selection);
          return {
            config: { ...nextConfig, twoDImages: syncTwoDImages(nextConfig) },
            saveState: dirtyState(),
            localRevision: state.localRevision + 1,
          };
        }),

      removeModel: (id) =>
        set((state) => {
          const nextConfig = alignHarnessConfig({
            ...state.config,
            models: state.config.models.filter((item) => item.id !== id),
            updatedAt: Date.now(),
          }, state.selection);
          return {
            config: { ...nextConfig, twoDImages: syncTwoDImages(nextConfig) },
            selection: state.selection.kind === 'model' && state.selection.id === id
              ? { kind: 'none' }
              : state.selection,
            saveState: dirtyState(),
            localRevision: state.localRevision + 1,
          };
        }),

      setSelection: (selection) => set({ selection }),

      resetConfig: () =>
        set({
          config: createDefaultConfig(),
          selection: { kind: 'none' },
          saveState: dirtyState(),
          canvasViewport: null,
          twoDViewport: null,
          localRevision: 0,
        }),

      rotateTwoDImage: (id) =>
        set((state) => ({
          config: {
            ...state.config,
            twoDImages: (state.config.twoDImages ?? []).map((img) => {
              if (img.id !== id) return img;
              const next = (((img.rotation ?? 0) + 90) % 360) as 0 | 90 | 180 | 270;
              return { ...img, rotation: next };
            }),
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
          localRevision: state.localRevision + 1,
        })),

      reorderTwoDImages: (fromIndex, toIndex) =>
        set((state) => {
          const imgs = [...(state.config.twoDImages ?? [])];
          const [moved] = imgs.splice(fromIndex, 1);
          imgs.splice(toIndex, 0, moved);
          return {
            config: { ...state.config, twoDImages: imgs, updatedAt: Date.now() },
            saveState: dirtyState(),
            localRevision: state.localRevision + 1,
          };
        }),

      moveTwoDImage: (id, x, y) =>
        set((state) => ({
          config: {
            ...state.config,
            twoDImages: (state.config.twoDImages ?? []).map((img) =>
              img.id === id ? { ...img, pos: { x, y } } : img,
            ),
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
          localRevision: state.localRevision + 1,
        })),

      syncTwoDImagesAuto: () =>
        set((state) => ({
          config: {
            ...state.config,
            twoDImages: syncTwoDImages(state.config),
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
          localRevision: state.localRevision + 1,
        })),

      updateDrawingFrame: (updates) =>
        set((state) => {
          const currentFrame = ensureDrawingFrame(state.config.drawingFrame, null, state.config);
          const nextFrame: ProductionDrawingFrame = {
            ...currentFrame,
            ...updates,
          };
          return {
            config: {
              ...state.config,
              drawingFrame: nextFrame,
              updatedAt: Date.now(),
            },
            saveState: dirtyState(),
            localRevision: state.localRevision + 1,
          };
        }),
    }),
);
