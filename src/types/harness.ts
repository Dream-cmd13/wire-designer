// ============================================================
// Wire Harness Designer - Professional Data Model
// Inspired by WireViz data model
// ============================================================

/** Connector definition (catalog part) */
export interface Connector {
  id: string;
  name: string;
  manufacturer: string;
  pinCount: number;
  pitch?: number;
  type: 'male' | 'female' | 'receptacle';
  pinLabels: string[];
  image?: string;
}

/** Wire type catalog entry */
export interface WireType {
  id: string;
  name: string;
  description: string;
  temperatureRating: string;
}

/** Wire color catalog entry */
export interface WireColor {
  id: string;
  name: string;
  hex: string;
}

/** Wire gauge catalog entry */
export interface WireGauge {
  awg: number;
  diameterMm: number;
  maxCurrent: number;
}

/**
 * Wire - represents a single conductor with precise pin-to-pin mapping.
 * This is the core concept: each wire connects one specific pin on a
 * source connector to one specific pin on a destination connector.
 */
export interface Wire {
  id: string;
  name: string;
  wireGauge: number;
  wireType: string;
  wireColor: string;
  lengthMm: number;
  fromConnectorId: string;
  fromPin: number;
  toConnectorId: string;
  toPin: number;
  signalName?: string;
  shielded?: boolean;
}

/**
 * WireBundle - optional, represents a multi-core cable that groups
 * multiple wires into a single physical cable.
 */
export interface WireBundle {
  id: string;
  name: string;
  wireCount: number;
  category: 'cable' | 'bundle';
  shielded: boolean;
  shieldColor?: string;
}

export type WireEndTreatment =
  | { stripped: false }
  | { stripped: true; method: 'tinned'; lengthMm: number }
  | { stripped: true; method: 'terminal'; terminalModel: 'cold-press-terminal' };

export interface ElectronicWireSpec {
  kind: 'electronic';
  color: string;
  lengthMm: number;
  awg: number;
  ulNumber: '1007';
  endTreatment: WireEndTreatment;
}

export type JacketMaterial = 'PVC' | 'PVR';
export type JacketColor = 'black' | 'green';
export type JacketCoreCount = 1 | 2 | 3 | 4 | 5 | 6 | 8 | 12 | 17;

export interface JacketedWireSpec {
  kind: 'jacketed';
  jacketMaterial: JacketMaterial;
  jacketColor: JacketColor;
  awg: number;
  coreCount: JacketCoreCount;
  shielded: boolean;
  odMm: number;
  coreColors: string[];
  endTreatment: WireEndTreatment;
}

export type CanvasWireSpec = ElectronicWireSpec | JacketedWireSpec;

/** A physical wire/cable that can be placed before it is connected. */
export interface CanvasWireMaterial {
  id: string;
  name: string;
  position: { x: number; y: number };
  width: number;
  spec: CanvasWireSpec;
  connectionId?: string;
  expandedByDefault?: boolean;
}

export type WireEndpoint = 'start' | 'end';

/** One endpoint can have multiple attachment records, enabling fan-out connections. */
export interface MaterialAttachment {
  id: string;
  materialId: string;
  endpoint: WireEndpoint;
  connectorNodeId: string;
  connectorHandle?: string | null;
}

export type ProtectiveSleeveType =
  | 'acetate-cloth'
  | 'fleece'
  | 'heat-shrink'
  | 'braided'
  | 'corrugated';

export interface ProtectiveSleeve {
  id: string;
  type: ProtectiveSleeveType;
  position: { x: number; y: number };
  width: number;
  lengthMm: number;
  attachedMaterialId?: string;
}

/**
 * HarnessNode - a node on the design canvas.
 * Can be a connector, junction point, or terminal.
 */
export interface HarnessNode {
  id: string;
  type: 'connector' | 'junction' | 'terminal';
  position: { x: number; y: number };
  connector?: Connector;
  label: string;
}

/**
 * Connection - represents a cable bundle/branch between two nodes.
 * Contains references to the individual wires that run through it.
 */
export interface Connection {
  id: string;
  name: string;
  fromNodeId: string;
  toNodeId: string;
  wireIds: string[];
}

/**
 * HarnessConfig - the top-level configuration for a wire harness design.
 * Contains all nodes, connections, wires, and metadata.
 */
export interface HarnessConfig {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  nodes: HarnessNode[];
  connections: Connection[];
  wires: Wire[];
  bundles?: WireBundle[];
  canvasMaterials?: CanvasWireMaterial[];
  materialAttachments?: MaterialAttachment[];
  protectiveSleeves?: ProtectiveSleeve[];
  quantity: number;
  leadTime: 'rush' | 'standard' | 'economy';
  protection?: string;
}

/** BOM item for cost estimation and manufacturing */
export interface BOMItem {
  type: 'connector' | 'wire' | 'cable' | 'accessory';
  partNumber?: string;
  manufacturer?: string;
  description: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
}

/** Price breakdown for quotation */
export interface PriceBreakdown {
  connectors: number;
  wires: number;
  labor: number;
  protection: number;
  leadTimeMultiplier: number;
  quantityDiscount: number;
  unitPrice: number;
  totalPrice: number;
}

/**
 * @deprecated Use Connection instead. Kept for backward compatibility.
 */
export type Branch = Connection;

/** Discriminated selection state for the editor */
export type Selection =
  | { kind: 'none' }
  | { kind: 'node'; id: string }
  | { kind: 'connection'; id: string }
  | { kind: 'wire'; id: string };

/** Save state for the editor document */
export type SaveState =
  | { status: 'saved'; savedAt: number }
  | { status: 'dirty' }
  | { status: 'saving' }
  | { status: 'error'; message: string };

/** Validation issue from the design rule checker */
export interface ValidationIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
  entity: { kind: 'project' | 'node' | 'connection' | 'wire'; id?: string };
  message: string;
  suggestedAction?: string;
}
