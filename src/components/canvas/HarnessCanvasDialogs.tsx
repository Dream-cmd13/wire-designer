import { Suspense } from 'react';
import { PartPickerDialog } from '@/components/shared/PartPickerDialog';
import {
  lengthMmToCanvasWidth,
  placeSleeveAroundMaterials,
} from '@/lib/canvasMaterials';
import { addConnector, changeConnectorPart, generateId } from '@/lib/commands';
import { useHarnessStore } from '@/stores/harnessStore';
import type {
  CanvasWireMaterial,
  HarnessConfig,
  MaterialEndpoint,
  ProtectiveSleeve,
  Selection,
} from '@/types/harness';
import { OvermoldPickerDialog } from '../shared/OvermoldPickerDialog';
import { ConnectorPropertiesDialog } from './ConnectorPropertiesDialog';
import {
  createNextModelFromSelection,
  getElectronicMaterialGroups,
  materialDescriptionForOption,
} from './harnessCanvasGeometry';
import { MaterialAccessoryDialog, type MaterialAccessoryKind } from './MaterialAccessoryDialog';
import { ProtectiveSleeveDialog } from './ProtectiveSleeveDialog';
import { WireMaterialDialog } from './WireMaterialDialog';

export interface SleeveDialogState {
  position: { x: number; y: number };
  materialId?: string;
  sleeveId?: string;
}

export interface ConnectorDialogState {
  position: { x: number; y: number };
}

export interface AccessoryDialogState {
  materialId: string;
  kind: MaterialAccessoryKind;
  accessoryId?: string;
  circuitId?: string;
  endpoint?: MaterialEndpoint;
}

interface HarnessCanvasDialogsProps {
  config: HarnessConfig;
  materials: CanvasWireMaterial[];
  sleeves: ProtectiveSleeve[];
  editingConnectorId: string | null;
  setEditingConnectorId: (id: string | null) => void;
  changingPartConnectorId: string | null;
  setChangingPartConnectorId: (id: string | null) => void;
  connectorDialog: ConnectorDialogState | null;
  setConnectorDialog: (value: ConnectorDialogState | null) => void;
  editingMaterialId: string | null;
  newMaterialDraft: CanvasWireMaterial | null;
  onCloseMaterialDialog: () => void;
  sleeveDialog: SleeveDialogState | null;
  setSleeveDialog: (value: SleeveDialogState | null) => void;
  modelDialogPosition: { x: number; y: number } | null;
  setModelDialogPosition: (value: { x: number; y: number } | null) => void;
  accessoryDialog: AccessoryDialogState | null;
  setAccessoryDialog: (value: AccessoryDialogState | null) => void;
  setSelection: (selection: Selection) => void;
  setCanvasSelection: (id: string | null) => void;
  onDeleteAccessory: (materialId: string, kind: MaterialAccessoryKind, accessoryId: string) => void;
}

export function HarnessCanvasDialogs({
  config,
  materials,
  sleeves,
  editingConnectorId,
  setEditingConnectorId,
  changingPartConnectorId,
  setChangingPartConnectorId,
  connectorDialog,
  setConnectorDialog,
  editingMaterialId,
  newMaterialDraft,
  onCloseMaterialDialog,
  sleeveDialog,
  setSleeveDialog,
  modelDialogPosition,
  setModelDialogPosition,
  accessoryDialog,
  setAccessoryDialog,
  setSelection,
  setCanvasSelection,
  onDeleteAccessory,
}: HarnessCanvasDialogsProps) {
  const editingMaterial = newMaterialDraft
    ?? materials.find((material) => material.id === editingMaterialId)
    ?? null;
  const editingSleeve = sleeves.find((item) => item.id === sleeveDialog?.sleeveId);
  const electronicGroups = getElectronicMaterialGroups(materials);
  const candidateMaterialIds = sleeveDialog?.materialId
    ? (electronicGroups.get(sleeveDialog.materialId) ?? [sleeveDialog.materialId])
    : materials.map((material) => material.id);
  const sleeveMaterialOptions = materials
    .filter((material) => candidateMaterialIds.includes(material.id))
    .map((material) => ({
      id: material.id,
      name: material.name,
      description: materialDescriptionForOption(material),
    }));

  return (
    <Suspense fallback={null}>
      {editingConnectorId && (
        <ConnectorPropertiesDialog
          connectorId={editingConnectorId}
          isOpen={true}
          onClose={() => setEditingConnectorId(null)}
          onChangePart={() => {
            const id = editingConnectorId;
            setEditingConnectorId(null);
            setChangingPartConnectorId(id);
          }}
        />
      )}
      {changingPartConnectorId && (() => {
        const instance = config.connectors.find((c) => c.id === changingPartConnectorId);
        if (!instance) return null;
        return (
          <PartPickerDialog
            isOpen
            onClose={() => setChangingPartConnectorId(null)}
            currentConnectorId={instance.connector.id}
            onSelect={(pickedConnector) => {
              const result = changeConnectorPart(config, changingPartConnectorId, pickedConnector);
              useHarnessStore.getState().replaceDocument(result.config, { userEdit: true });
              setChangingPartConnectorId(null);
            }}
          />
        );
      })()}
      {connectorDialog && (
        <PartPickerDialog
          isOpen
          onClose={() => setConnectorDialog(null)}
          onSelect={(connector) => {
            const state = useHarnessStore.getState();
            const nextConfig = addConnector(state.config, {
              position: connectorDialog.position,
              connector,
            });
            state.replaceDocument(nextConfig, { userEdit: true });
            const added = nextConfig.connectors[nextConfig.connectors.length - 1];
            if (added) {
              setSelection({ kind: 'connector', id: added.id });
            }
            setConnectorDialog(null);
          }}
        />
      )}
      {editingMaterial && (
        <WireMaterialDialog
          key={editingMaterialId ?? 'closed'}
          material={editingMaterial}
          onCancel={onCloseMaterialDialog}
          onConfirm={(updates) => {
            if (newMaterialDraft) {
              useHarnessStore.getState().addMaterial({ ...newMaterialDraft, ...updates });
              setSelection({ kind: 'material', id: newMaterialDraft.id });
              setCanvasSelection(newMaterialDraft.id);
            } else if (editingMaterialId) {
              useHarnessStore.getState().updateMaterial(editingMaterialId, updates);
            }
            onCloseMaterialDialog();
          }}
        />
      )}

      {sleeveDialog && (
        <ProtectiveSleeveDialog
          key={sleeveDialog.sleeveId ?? `${sleeveDialog.materialId ?? 'pane'}-open`}
          isOpen
          editing={Boolean(sleeveDialog.sleeveId)}
          initialType={
            sleeves.find((item) => item.id === sleeveDialog?.sleeveId)?.type
            ?? 'heat-shrink'
          }
          initialLengthMm={
            sleeves.find((item) => item.id === sleeveDialog?.sleeveId)?.lengthMm
            ?? 100
          }
          initialCorrugatedMaterial={
            sleeves.find((item) => item.id === sleeveDialog?.sleeveId)?.corrugatedMaterial
            ?? 'PP'
          }
          initialMaterialIds={
            editingSleeve?.attachedMaterialIds
            ?? (sleeveDialog?.materialId ? [sleeveDialog.materialId] : [])
          }
          initialRemark={editingSleeve?.remark ?? ''}
          initialCorrugatedFixing={editingSleeve?.corrugatedFixing}
          materialOptions={sleeveMaterialOptions}
          onCancel={() => setSleeveDialog(null)}
          onConfirm={(type, lengthMm, corrugatedMaterial, materialIds, remark, corrugatedFixing) => {
            if (!sleeveDialog) return;
            const state = useHarnessStore.getState();
            const width = lengthMmToCanvasWidth(lengthMm);
            const attachedMaterials = materialIds
              .map((materialId) => state.config.materials.find((material) => material.id === materialId))
              .filter((material): material is CanvasWireMaterial => Boolean(material));
            const placement = placeSleeveAroundMaterials(attachedMaterials, width);
            const position = placement?.position ?? sleeveDialog.position;
            const height = placement?.height ?? 36;

            if (sleeveDialog.sleeveId) {
              state.updateProtectiveSleeve(sleeveDialog.sleeveId, {
                type,
                lengthMm,
                width,
                height,
                position,
                attachedMaterialIds: materialIds,
                corrugatedMaterial: type === 'corrugated' ? corrugatedMaterial : undefined,
                corrugatedFixing: type === 'corrugated' ? corrugatedFixing : undefined,
                remark,
              });
              setSelection({ kind: 'sleeve', id: sleeveDialog.sleeveId });
              setCanvasSelection(sleeveDialog.sleeveId);
            } else {
              const sleeve: ProtectiveSleeve = {
                id: generateId(),
                type,
                lengthMm,
                width,
                height,
                position,
                attachedMaterialIds: materialIds,
                corrugatedMaterial: type === 'corrugated' ? corrugatedMaterial : undefined,
                corrugatedFixing: type === 'corrugated' ? corrugatedFixing : undefined,
                remark,
              };
              state.addProtectiveSleeve(sleeve);
              setSelection({ kind: 'sleeve', id: sleeve.id });
              setCanvasSelection(sleeve.id);
            }
            setSleeveDialog(null);
          }}
        />
      )}

      {modelDialogPosition && (
        <OvermoldPickerDialog
          isOpen={true}
          onClose={() => setModelDialogPosition(null)}
          onSelect={(selection) => {
            const state = useHarnessStore.getState();
            const model = createNextModelFromSelection(state.config, modelDialogPosition, selection);
            state.addModel(model);
            setSelection({ kind: 'model', id: model.id });
            setCanvasSelection(model.id);
            setModelDialogPosition(null);
          }}
        />
      )}

      {accessoryDialog && (() => {
        const material = materials.find((item) => item.id === accessoryDialog.materialId);
        if (!material) return null;
        const editingLabel = accessoryDialog.kind === 'label'
          ? (material.labels ?? []).find((item) => item.id === accessoryDialog.accessoryId)
          : undefined;
        const editingNumberTube = accessoryDialog.kind === 'number-tube'
          ? (material.numberTubes ?? []).find((item) => item.id === accessoryDialog.accessoryId)
          : undefined;
        return (
          <MaterialAccessoryDialog
            key={`${accessoryDialog.materialId}:${accessoryDialog.kind}:${accessoryDialog.accessoryId ?? 'new'}`}
            kind={accessoryDialog.kind}
            materialName={material.name}
            editing={Boolean(accessoryDialog.accessoryId)}
            initialContent={editingLabel?.content ?? editingNumberTube?.content ?? ''}
            initialLengthMm={editingLabel?.lengthMm ?? editingNumberTube?.lengthMm}
            initialDistanceMm={editingNumberTube?.distanceMm ?? 0}
            onCancel={() => setAccessoryDialog(null)}
            onDelete={() => {
              if (!accessoryDialog.accessoryId) return;
              onDeleteAccessory(material.id, accessoryDialog.kind, accessoryDialog.accessoryId);
              setAccessoryDialog(null);
            }}
            onConfirm={(content, lengthMm, distanceMm) => {
              const state = useHarnessStore.getState();
              const current = state.config.materials.find((item) => item.id === material.id);
              if (!current) return;
              if (accessoryDialog.kind === 'label') {
                state.updateMaterial(material.id, {
                  labels: accessoryDialog.accessoryId
                    ? (current.labels ?? []).map((item) =>
                        item.id === accessoryDialog.accessoryId
                          ? { ...item, content, lengthMm }
                          : item,
                      )
                    : [
                        ...(current.labels ?? []),
                        {
                          id: generateId(),
                          material: '五防热敏纸标签纸',
                          content,
                          lengthMm,
                        },
                      ],
                });
              } else {
                state.updateMaterial(material.id, {
                  numberTubes: accessoryDialog.accessoryId
                    ? (current.numberTubes ?? []).map((item) =>
                        item.id === accessoryDialog.accessoryId
                          ? {
                              ...item,
                              content,
                              lengthMm,
                              circuitId: accessoryDialog.circuitId ?? item.circuitId,
                              endpoint: accessoryDialog.endpoint ?? item.endpoint,
                              distanceMm: distanceMm ?? item.distanceMm ?? 0,
                            }
                          : item,
                      )
                    : [
                        ...(current.numberTubes ?? []),
                        {
                          id: generateId(),
                          content,
                          lengthMm,
                          circuitId: accessoryDialog.circuitId,
                          endpoint: accessoryDialog.endpoint,
                          distanceMm: distanceMm ?? 0,
                        },
                      ],
                });
              }
              setAccessoryDialog(null);
            }}
          />
        );
      })()}
    </Suspense>
  );
}
