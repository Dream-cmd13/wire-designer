// ============================================================
// Wire Harness Designer - Professional Data Model (v3)
//
// Business objects converged to three kinds:
//   1. Connector (连接器)
//   2. Wire Material (线材 — electronic wire or jacketed cable)
//   3. Protective Sleeve (保护套)
//
// PIN / color / signal definitions live directly on the material's
// `circuits` (接线明细). There is no longer an independent Wire,
// Connection, or WireBundle domain object.
// ============================================================

/** Connector catalog entry (part definition) */
export interface Connector {
  id: string;
  /** Stable UUID of the catalog_items row when loaded from Supabase. */
  resourceItemId?: string;
  name: string;
  model?: string;
  manufacturer: string;
  resourceGroup?: string;
  description?: string;
  series?: string;
  pinCount: number;
  rowCount?: number;
  pitch?: number;
  type: 'male' | 'female' | 'receptacle';
  pinLabels: string[];
  image?: string;
  imageVariants?: {
    before?: string;
    after?: string;
    pinMap?: string;
  };
  /** Optional M12/industrial connector material fields */
  housingMaterial?: string;
  contactMaterial?: string;
  nutMaterial?: string;
}

/** Wire color catalog entry */
export interface WireColor {
  id: string;
  name: string;
  hex: string;
}

// ============================================================
// Wire Material Specs
// ============================================================

export type WireTerminationMethod = 'none' | 'tinned' | 'terminal';

export interface WireEndProcessing {
  stripped: boolean;
  stripLengthMm?: number;
  termination: WireTerminationMethod;
  terminalModel?: 'cold-press-terminal';
}

export interface WireEndTreatment {
  start: WireEndProcessing;
  end: WireEndProcessing;
}

export interface ElectronicWireSpec {
  kind: 'electronic';
  color: string;
  lengthMm: number;
  awg: number;
  ulNumber: '1007';
  endTreatment: WireEndTreatment;
}

export type JacketMaterial = 'PVC' | 'PUR';
export type JacketColor = 'black' | 'green';
/** Jacketed cable core count. Runtime validation constrains this to 1-100. */
export type JacketCoreCount = number;

/** Allowed UL numbers for jacketed wires (single-select, may be absent). */
export type JacketUlNumber = 'UL2464' | 'UL20276';

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
  lengthMm: number;
  /** Optional UL number; `undefined` means "无". */
  ulNumber?: JacketUlNumber;
}

export type CanvasWireSpec = ElectronicWireSpec | JacketedWireSpec;

// ============================================================
// Material Circuit (接线明细)
// ============================================================

export type ConnectorSide = 'left' | 'right';
export type MaterialEndpoint = 'start' | 'end';

export interface MaterialEndpointRouteOffset {
  offsetX: number;
  offsetY: number;
}

/** A reference to a specific pin on a specific side of a connector. */
export interface ConnectorPinRef {
  connectorId: string;
  connectorSide: ConnectorSide;
  pin: number;
}

/**
 * MaterialCircuit — one row of pin-assignment detail on a wire material.
 *
 * - Single-end connection: only `start` OR only `end` is set.
 * - Two-end connection: both `start` and `end` are set.
 * - A material may carry many circuits (multi-pin on same side).
 * - `color` and `signalName` always belong to the circuit, so they
 *   are visible immediately even on a single-end connection.
 */
export interface MaterialCircuit {
  id: string;
  start?: ConnectorPinRef;
  end?: ConnectorPinRef;
  color: string;
  signalName: string;
  /** Optional local core length used by production drawing annotations. */
  lengthMm?: number;
  /** Human-facing connection number used in wiring tables. */
  connectionNo?: string;
  /** For jacketed wires: which core this circuit binds to. */
  coreIndex?: number;
  route?: Partial<Record<MaterialEndpoint, MaterialEndpointRouteOffset>>;
}

// ============================================================
// Connector Instance & Jumper (短接)
// ============================================================

/**
 * ConnectorJumper — an internal short-circuit between pins on the
 * same side of a connector. `pins` holds two or more distinct pins
 * that are electrically joined. A jumper also locks the connector's
 * active side (same as an external material connection).
 */
export interface ConnectorJumper {
  id: string;
  side: ConnectorSide;
  pins: number[];
}

/** A connector placed on the design canvas. */
export interface ConnectorInstance {
  id: string;
  position: { x: number; y: number };
  connector: Connector;
  label: string;
  jumpers: ConnectorJumper[];
}

// ============================================================
// Canvas Wire Material
// ============================================================

export interface WireDimensionOverride {
  displayLength?: number;
  upperTolerance?: string;
  lowerTolerance?: string;
  isCustom?: boolean;
}

/** A physical wire/cable placed on the canvas. */
export interface CanvasWireMaterial {
  id: string;
  /** Optional resource selection; the canvas instance still has its own id. */
  resourceItemId?: string;
  resourceImageUrl?: string;
  name: string;
  position: { x: number; y: number };
  width: number;
  spec: CanvasWireSpec;
  circuits: MaterialCircuit[];
  labels?: WireLabel[];
  numberTubes?: WireNumberTube[];
  expandedByDefault?: boolean;
  dimension?: WireDimensionOverride;
}

export interface WireLabel {
  id: string;
  material: string;
  content: string;
  lengthMm: number;
}

export interface WireNumberTube {
  id: string;
  content: string;
  lengthMm: number;
  circuitId?: string;
  endpoint?: MaterialEndpoint;
  distanceMm?: number;
}

// ============================================================
// Protective Sleeve
// ============================================================

export type ProtectiveSleeveType =
  | 'acetate-cloth'
  | 'fleece'
  | 'heat-shrink'
  | 'braided'
  | 'corrugated';

export type CorrugatedMaterial = 'PP' | 'PA' | 'stainless-steel';

export interface ProtectiveSleeve {
  id: string;
  type: ProtectiveSleeveType;
  corrugatedMaterial?: CorrugatedMaterial;
  corrugatedFixing?: {
    startHeatShrink: boolean;
    endHeatShrink: boolean;
    startDistanceMm: number;
    endDistanceMm: number;
  };
  position: { x: number; y: number };
  width: number;
  height: number;
  lengthMm: number;
  /** A sleeve may cover one wire, a subset, or a complete wire group. */
  attachedMaterialIds: string[];
  remark?: string;
}

// ============================================================
// Overmold Catalog
// ============================================================

export type OvermoldForm = 'straight' | 'bent';
export type OvermoldOuterMaterial = '黑色PVC' | '黑色TPE';
export type OvermoldHardness = '45P';
export type OvermoldInnerMaterial = '低密度透明PE';

export interface OvermoldSpec {
  id: string;
  resourceItemId?: string;
  name: string;
  image?: string;
  outerMaterial: OvermoldOuterMaterial;
  outerHardness?: OvermoldHardness;
  outerForm: OvermoldForm;
  innerMaterial?: OvermoldInnerMaterial;
  innerForm?: OvermoldForm;
}

// ============================================================
// Canvas Model / Outer Mold
// ============================================================

export type CanvasModelKind = 'outer-box';

export interface CanvasModel {
  id: string;
  kind: CanvasModelKind;
  position: { x: number; y: number };
  width: number;
  height: number;
  /** Reference to an OvermoldSpec resource entry */
  overmoldSpecId: string;
  includeInnerMold: boolean;
  resourceItemId?: string;
  resourceImageUrl?: string;
}

export interface OvermoldSelection {
  overmold: OvermoldSpec;
  includeInnerMold: boolean;
}

// ============================================================
// Top-level Harness Config
// ============================================================

/** A 2D image associated with a design element */
export interface TwoDImage {
  id: string;
  name: string;
  dataUrl: string;
  source: 'catalog';
  imageRole?: 'primary' | 'connector-before' | 'connector-after' | 'connector-pin-map';
  assetPath?: string;
  elementKind?: 'connector' | 'material' | 'sleeve' | 'model';
  elementId?: string;
  rotation?: 0 | 90 | 180 | 270;
  /** Mirror horizontally when the product-side image sits on the right side of a wire. */
  flipX?: boolean;
  /** Free-canvas position (pixels from top-left of canvas). Auto-layout used when absent. */
  pos?: { x: number; y: number };
}

export interface DrawingWizardTopology {
  harnessType: 'internal' | 'external';
  topology: 'single-end' | 'double-end' | 'both-tinned' | 'one-to-many';
  wireKind: 'electronic' | 'twisted' | 'ribbon' | 'parallel' | 'jacketed';
}

export interface DrawingConnectorResource {
  id: string;
  name: string;
  view: 'front' | 'top' | 'back';
  gender: 'male' | 'female';
  side: 'left' | 'right' | 'none';
  category: string;
  series: string;
  pinCount: number;
  rowCount?: number;
  pitchMm?: number;
  heightMm?: number;
  imageAssetId?: string;
}

export interface DrawingHarnessAttributes {
  moldId?: string;
  drawingWireNo?: string;
  totalLengthMm?: number;
  lengthToleranceMm?: number;
  heatShrinkId?: string;
  tailTreatment?: {
    stripTinLengthMm?: number;
    toleranceMm?: number;
    halfStrip?: boolean;
  };
}

export interface DrawingWireRowDraft {
  index: number;
  color: string;
  lengthMm?: number;
  signalName?: string;
  connectionNo: string;
}

export interface DrawingWizardDraft {
  topology: DrawingWizardTopology;
  leftResource?: DrawingConnectorResource;
  rightResource?: DrawingConnectorResource;
  singleResource?: DrawingConnectorResource;
  attributes: DrawingHarnessAttributes;
  wires: DrawingWireRowDraft[];
}

interface ProductionDrawingObjectBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DrawingConnectorObject extends ProductionDrawingObjectBase {
  kind: 'connector';
  connectorId: string;
  label: string;
  pinCount: number;
  side: 'left' | 'right' | 'none';
}

export interface DrawingWireBundleObject extends ProductionDrawingObjectBase {
  kind: 'wire-bundle';
  materialIds: string[];
  wireCount: number;
  jacketed: boolean;
}

export interface DrawingDimensionObject extends ProductionDrawingObjectBase {
  kind: 'dimension';
  label: string;
}

export interface DrawingTextObject extends ProductionDrawingObjectBase {
  kind: 'text';
  text: string;
  fontSize: number;
}

export interface DrawingBomTableObject extends ProductionDrawingObjectBase {
  kind: 'bom-table';
  rows: Array<{
    item: number;
    description: string;
    quantity: number;
  }>;
}

export interface DrawingWiringTableObject extends ProductionDrawingObjectBase {
  kind: 'wiring-table';
  rows: Array<{
    item: number;
    color: string;
    signalName: string;
    connectionNo: string;
    startPin?: number;
    endPin?: number;
    lengthMm?: number;
  }>;
}

export interface DrawingTitleBlockObject extends ProductionDrawingObjectBase {
  kind: 'title-block';
  title: string;
  drawingNo: string;
  revision: string;
}

export interface DrawingTechRequirementObject extends ProductionDrawingObjectBase {
  kind: 'tech-requirements';
  requirements: string[];
}

export type ProductionDrawingObject =
  | DrawingConnectorObject
  | DrawingWireBundleObject
  | DrawingDimensionObject
  | DrawingTextObject
  | DrawingBomTableObject
  | DrawingWiringTableObject
  | DrawingTitleBlockObject
  | DrawingTechRequirementObject;

export interface ProductionDrawing {
  schemaVersion: 1;
  page: {
    size: 'A4';
    orientation: 'landscape';
    width: 1200;
    height: 800;
  };
  objects: ProductionDrawingObject[];
  revisionTable: Array<{
    revision: string;
    description: string;
    date: string;
  }>;
  titleBlock: {
    title: string;
    drawingNo: string;
    revision: string;
  };
  techRequirements: string[];
}

export interface DrawingSignOff {
  name: string;
  date: string;
}

export interface DrawingRevisionRow {
  rev: string;
  description: string;
  date: string;
}

export interface ProductionDrawingFrame {
  partNo: string;
  title: string;
  drawingNo: string;
  revision: string;
  sheet: string;
  scale: string;
  unit: string;
  size: string;
  approved: DrawingSignOff;
  designer: DrawingSignOff;
  drawn: DrawingSignOff;
  revisionRows: DrawingRevisionRow[];
  complianceNote: string;
  technicalRequirements?: string;
  companyNameCn: string;
  companyNameEn: string;
}

/**
 * HarnessConfig — the top-level configuration for a wire harness design.
 * Only three kinds of business objects exist: connectors, materials, sleeves.
 */
export interface HarnessConfig {
  schemaVersion: 3;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  connectors: ConnectorInstance[];
  materials: CanvasWireMaterial[];
  protectiveSleeves: ProtectiveSleeve[];
  models: CanvasModel[];
  quantity: number;
  leadTime: 'rush' | 'standard' | 'economy';
  twoDImages?: TwoDImage[];
  productionDrawing?: ProductionDrawing;
  drawingFrame?: ProductionDrawingFrame;
}

// ============================================================
// BOM & Pricing
// ============================================================

/** BOM item for cost estimation and manufacturing */
export interface BOMItem {
  type: 'connector' | 'wire' | 'accessory';
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

// ============================================================
// Editor State
// ============================================================

/** Discriminated selection state for the editor */
export type Selection =
  | { kind: 'none' }
  | { kind: 'connector'; id: string }
  | { kind: 'material'; id: string }
  | { kind: 'sleeve'; id: string }
  | { kind: 'model'; id: string };

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
  entity: { kind: 'project' | 'connector' | 'material' | 'sleeve'; id?: string };
  message: string;
  suggestedAction?: string;
}
