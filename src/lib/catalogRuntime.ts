import type { Connector, OvermoldSpec, WireColor } from '@/types/harness';
import type { CatalogSnapshot, CatalogWire, ProtectionOption } from '@/types/catalog';

let activeSnapshot: CatalogSnapshot | null = null;
const EMPTY_CONNECTORS: Connector[] = [];
const EMPTY_WIRES: CatalogWire[] = [];
const EMPTY_OVERMOLDS: OvermoldSpec[] = [];
const EMPTY_WIRE_COLORS: WireColor[] = [];
const EMPTY_PROTECTION_OPTIONS: ProtectionOption[] = [];

export function getCatalogSnapshot(): CatalogSnapshot | null {
  return activeSnapshot;
}

export function setCatalogSnapshot(snapshot: CatalogSnapshot): void {
  activeSnapshot = snapshot;
}

export function clearCatalogSnapshot(): void {
  activeSnapshot = null;
}

export function requireCatalogSnapshot(): CatalogSnapshot {
  if (!activeSnapshot) {
    throw new Error('目录数据尚未加载，请稍后重试。');
  }
  return activeSnapshot;
}

export function findRuntimeConnector(connectorId: string): Connector | undefined {
  return activeSnapshot?.connectors.find((connector) => connector.id === connectorId);
}

export function getCatalogConnectors(snapshot: CatalogSnapshot | null): Connector[] {
  return snapshot?.connectors ?? EMPTY_CONNECTORS;
}

export function getCatalogWires(snapshot: CatalogSnapshot | null): CatalogWire[] {
  return snapshot?.wires ?? EMPTY_WIRES;
}

export function getCatalogOvermolds(snapshot: CatalogSnapshot | null): OvermoldSpec[] {
  return snapshot?.overmolds ?? EMPTY_OVERMOLDS;
}

export function getCatalogWireColors(snapshot: CatalogSnapshot | null): WireColor[] {
  return snapshot?.wireColors ?? EMPTY_WIRE_COLORS;
}

export function getCatalogProtectionOptions(snapshot: CatalogSnapshot | null): ProtectionOption[] {
  return snapshot?.protectionOptions ?? EMPTY_PROTECTION_OPTIONS;
}

