import { create } from 'zustand';
import type {
  CanvasModel,
  CanvasWireMaterial,
  ConnectorInstance,
  HarnessConfig,
  ProtectiveSleeve,
  SaveState,
  Selection,
  TwoDImage,
} from '@/types/harness';
import { CONNECTORS } from '@/lib/data';
import { imageAssets } from '@/lib/imageAssets';
import { lengthMmToCanvasWidth } from '@/lib/canvasMaterials';
import { syncTwoDImages } from '@/lib/autoAssociateTwoDImages';
import {
  generateId,
  removeConnector as removeConnectorCommand,
  removeMaterial as removeMaterialCommand,
  updateMaterial as updateMaterialCommand,
  updateProtectiveSleeve as updateProtectiveSleeveCommand,
} from '@/lib/commands';

function assetImageByName(name: string): TwoDImage | null {
  const asset = imageAssets.find((a) => a.name === name);
  if (!asset) return null;
  return {
    id: generateId(),
    name: asset.name,
    dataUrl: asset.url,
    source: 'asset',
    assetPath: asset.id,
  };
}

export function createDefaultConfig(): HarnessConfig {
  const m12Connector = CONNECTORS.find((c) => c.id === 'm12a04-07-093')!;

  const connectorId = 'mock-connector-m12';
  const materialId = 'mock-material-jacketed';
  const modelId = 'mock-model-overmold';

  const jacketedSpec = {
    kind: 'jacketed' as const,
    jacketMaterial: 'PVC' as const,
    jacketColor: 'black' as const,
    awg: 22,
    coreCount: 4 as const,
    shielded: false,
    odMm: 4.50,
    coreColors: ['棕色', '白色', '蓝色', '黑色'],
    endTreatment: {
      start: { stripped: false, termination: 'none' as const },
      end: { stripped: false, termination: 'none' as const },
    },
    lengthMm: 300,
  };

  const material: CanvasWireMaterial = {
    id: materialId,
    name: 'W1 护套线',
    position: { x: 280, y: 200 },
    width: lengthMmToCanvasWidth(jacketedSpec.lengthMm),
    spec: jacketedSpec,
    circuits: [
      { id: generateId(), color: '棕色', signalName: 'Pin1', coreIndex: 0 },
      { id: generateId(), color: '白色', signalName: 'Pin2', coreIndex: 1 },
      { id: generateId(), color: '蓝色', signalName: 'Pin3', coreIndex: 2 },
      { id: generateId(), color: '黑色', signalName: 'Pin4', coreIndex: 3 },
    ],
    expandedByDefault: true,
  };

  const connectorInstance: ConnectorInstance = {
    id: connectorId,
    position: { x: 80, y: 180 },
    connector: { ...m12Connector },
    label: 'M12端',
    jumpers: [],
  };

  const overmoldModel: CanvasModel = {
    id: modelId,
    kind: 'outer-box',
    position: { x: 160, y: 160 },
    width: 80,
    height: 80,
    overmoldSpecId: 'pvc-45p-pe',
  };

  // Build twoDImages with auto-associations from root image assets
  const twoDImages: TwoDImage[] = [];

  const wireImg = assetImageByName('护套线');
  if (wireImg) twoDImages.push({ ...wireImg, elementKind: 'material', elementId: materialId });

  const connectorImg = assetImageByName('连接器注塑后');
  if (connectorImg) twoDImages.push({ ...connectorImg, elementKind: 'connector', elementId: connectorId });

  const connectorBeforeImg = assetImageByName('连接器注塑前');
  if (connectorBeforeImg) twoDImages.push({ ...connectorBeforeImg, elementKind: 'connector', elementId: connectorId });

  const overmoldImg = assetImageByName('外模');
  if (overmoldImg) twoDImages.push({ ...overmoldImg, elementKind: 'model', elementId: modelId });

  return {
    schemaVersion: 3,
    id: generateId(),
    name: 'M12防水线束示例',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    connectors: [connectorInstance],
    materials: [material],
    protectiveSleeves: [],
    models: [overmoldModel],
    quantity: 1,
    leadTime: 'standard',
    twoDImages,
  };
}

interface ReplaceDocumentOptions {
  markSaved?: boolean;
}

interface HarnessState {
  config: HarnessConfig;
  selection: Selection;
  saveState: SaveState;
  setConfig: (config: Partial<HarnessConfig>) => void;
  patchDocument: (partial: Partial<HarnessConfig>) => void;
  replaceDocument: (fullConfig: HarnessConfig, options?: ReplaceDocumentOptions) => void;
  markSaving: () => void;
  markSaved: () => void;
  markSaveError: (message: string) => void;

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

  // 2D image actions
  addTwoDImage: (image: TwoDImage) => void;
  removeTwoDImage: (id: string) => void;
  updateTwoDImageAssociation: (
    id: string,
    elementKind: TwoDImage['elementKind'],
    elementId: string,
  ) => void;
  clearTwoDImageAssociation: (id: string) => void;
  rotateTwoDImage: (id: string) => void;
  reorderTwoDImages: (fromIndex: number, toIndex: number) => void;
  moveTwoDImage: (id: string, x: number, y: number) => void;
  syncTwoDImagesAuto: () => void; // New: auto-sync 2D images
}

function dirtyState() {
  return { status: 'dirty' } as const;
}

export const useHarnessStore = create<HarnessState>()(
    (set) => ({
      config: createDefaultConfig(),
      selection: { kind: 'none' },
      saveState: { status: 'saved', savedAt: Date.now() },

      setConfig: (updates) =>
        set((state) => ({
          config: { ...state.config, ...updates, updatedAt: Date.now() },
          saveState: dirtyState(),
        })),

      patchDocument: (partial) =>
        set((state) => ({
          config: { ...state.config, ...partial, updatedAt: Date.now() },
          saveState: dirtyState(),
        })),

      replaceDocument: (fullConfig, options) =>
        set({
          config: options?.markSaved
            ? fullConfig
            : { ...fullConfig, twoDImages: syncTwoDImages(fullConfig) },
          selection: { kind: 'none' },
          saveState: options?.markSaved ? { status: 'saved', savedAt: Date.now() } : dirtyState(),
        }),

      markSaving: () => set({ saveState: { status: 'saving' } }),
      markSaved: () => set({ saveState: { status: 'saved', savedAt: Date.now() } }),
      markSaveError: (message) => set({ saveState: { status: 'error', message } }),

      addConnector: (connector) =>
        set((state) => {
          const nextConfig = {
            ...state.config,
            connectors: [...state.config.connectors, connector],
            updatedAt: Date.now(),
          };
          return {
            config: { ...nextConfig, twoDImages: syncTwoDImages(nextConfig) },
            saveState: dirtyState(),
          };
        }),

      updateConnector: (id, updates) =>
        set((state) => {
          const nextConfig = {
            ...state.config,
            connectors: state.config.connectors.map((c) =>
              c.id === id ? { ...c, ...updates } : c,
            ),
            updatedAt: Date.now(),
          };
          return {
            config: { ...nextConfig, twoDImages: syncTwoDImages(nextConfig) },
            saveState: dirtyState(),
          };
        }),

      removeConnector: (id) =>
        set((state) => {
          const nextSelection =
            state.selection.kind === 'connector' && state.selection.id === id
              ? ({ kind: 'none' } as const)
              : state.selection;

          const nextConfig = removeConnectorCommand(state.config, id);
          return {
            config: { ...nextConfig, twoDImages: syncTwoDImages(nextConfig) },
            selection: nextSelection,
            saveState: dirtyState(),
          };
        }),

      addMaterial: (material) =>
        set((state) => {
          const nextConfig = {
            ...state.config,
            materials: [...state.config.materials, material],
            updatedAt: Date.now(),
          };
          return {
            config: { ...nextConfig, twoDImages: syncTwoDImages(nextConfig) },
            saveState: dirtyState(),
          };
        }),

      updateMaterial: (id, updates) =>
        set((state) => {
          const nextConfig = updateMaterialCommand(state.config, id, updates);
          return {
            config: { ...nextConfig, twoDImages: syncTwoDImages(nextConfig) },
            saveState: dirtyState(),
          };
        }),

      removeMaterial: (id) =>
        set((state) => {
          const nextConfig = removeMaterialCommand(state.config, id);
          return {
            config: { ...nextConfig, twoDImages: syncTwoDImages(nextConfig) },
            saveState: dirtyState(),
          };
        }),

      addProtectiveSleeve: (sleeve) =>
        set((state) => ({
          config: {
            ...state.config,
            protectiveSleeves: [...state.config.protectiveSleeves, sleeve],
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
        })),

      updateProtectiveSleeve: (id, updates) =>
        set((state) => ({
          config: updateProtectiveSleeveCommand(state.config, id, updates),
          saveState: dirtyState(),
        })),

      removeProtectiveSleeve: (id) =>
        set((state) => ({
          config: {
            ...state.config,
            protectiveSleeves: state.config.protectiveSleeves.filter((item) => item.id !== id),
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
        })),

      addModel: (model) =>
        set((state) => {
          const nextConfig = {
            ...state.config,
            models: [...state.config.models, model],
            updatedAt: Date.now(),
          };
          return {
            config: { ...nextConfig, twoDImages: syncTwoDImages(nextConfig) },
            saveState: dirtyState(),
          };
        }),

      updateModel: (id, updates) =>
        set((state) => {
          const nextConfig = {
            ...state.config,
            models: state.config.models.map((item) =>
              item.id === id ? { ...item, ...updates } : item,
            ),
            updatedAt: Date.now(),
          };
          return {
            config: { ...nextConfig, twoDImages: syncTwoDImages(nextConfig) },
            saveState: dirtyState(),
          };
        }),

      removeModel: (id) =>
        set((state) => {
          const nextConfig = {
            ...state.config,
            models: state.config.models.filter((item) => item.id !== id),
            updatedAt: Date.now(),
          };
          return {
            config: { ...nextConfig, twoDImages: syncTwoDImages(nextConfig) },
            selection: state.selection.kind === 'model' && state.selection.id === id
              ? { kind: 'none' }
              : state.selection,
            saveState: dirtyState(),
          };
        }),

      setSelection: (selection) => set({ selection }),

      resetConfig: () =>
        set({
          config: createDefaultConfig(),
          selection: { kind: 'none' },
          saveState: dirtyState(),
        }),

      addTwoDImage: (image) =>
        set((state) => ({
          config: {
            ...state.config,
            twoDImages: [...(state.config.twoDImages ?? []), image],
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
        })),

      removeTwoDImage: (id) =>
        set((state) => ({
          config: {
            ...state.config,
            twoDImages: (state.config.twoDImages ?? []).filter((img) => img.id !== id),
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
        })),

      updateTwoDImageAssociation: (id, elementKind, elementId) =>
        set((state) => ({
          config: {
            ...state.config,
            twoDImages: (state.config.twoDImages ?? []).map((img) =>
              img.id === id ? { ...img, elementKind, elementId } : img,
            ),
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
        })),

      clearTwoDImageAssociation: (id) =>
        set((state) => ({
          config: {
            ...state.config,
            twoDImages: (state.config.twoDImages ?? []).map((img) =>
              img.id === id
                ? { ...img, elementKind: undefined, elementId: undefined }
                : img,
            ),
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
        })),

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
        })),

      reorderTwoDImages: (fromIndex, toIndex) =>
        set((state) => {
          const imgs = [...(state.config.twoDImages ?? [])];
          const [moved] = imgs.splice(fromIndex, 1);
          imgs.splice(toIndex, 0, moved);
          return {
            config: { ...state.config, twoDImages: imgs, updatedAt: Date.now() },
            saveState: dirtyState(),
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
        })),

      syncTwoDImagesAuto: () =>
        set((state) => ({
          config: {
            ...state.config,
            twoDImages: syncTwoDImages(state.config),
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
        })),
    }),
);
