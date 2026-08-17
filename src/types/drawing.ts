export type DrawingPage = {
  size: 'A4';
  orientation: 'landscape';
  width: 1200;
  height: 800;
};

export type DrawingObjectStyle = {
  fill: string;
  stroke: string;
  strokeWidth: number;
  fontSize: number;
  color: string;
};

export type DrawingObjectBase = {
  id: string;
  kind: DrawingObjectKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  style: DrawingObjectStyle;
};

export type DrawingObjectKind =
  | 'connector'
  | 'wire-bundle'
  | 'accessory'
  | 'text'
  | 'label'
  | 'dimension'
  | 'line'
  | 'polyline'
  | 'curve'
  | 'freehand'
  | 'table'
  | 'bom-table'
  | 'wiring-table'
  | 'tech-requirements'
  | 'group'
  | 'icon'
  | 'title-block';

export type DrawingPoint = { x: number; y: number };

export type DrawingTableRow = Record<string, string>;
export type DrawingTableTextOffsets = Record<string, DrawingPoint>;
export type DrawingTableTextSize = { width: number; height: number; fontSize: number };
export type DrawingTableRole = 'bom' | 'revision' | 'title-block';
export type DrawingTableMerge = { rowIndex: number; columnIndex: number; rowSpan: number; columnSpan: number };
export type DrawingTableLayoutFields = {
  showTitleRow?: boolean;
  columnWidths?: number[];
  titleRowHeight?: number;
  headerRowHeight?: number;
  rowHeights?: number[];
  textSizes?: Record<string, DrawingTableTextSize>;
  columnKeys?: string[];
  tableRole?: DrawingTableRole;
  mergedCells?: DrawingTableMerge[];
  projectionCellKey?: string;
};
export type DrawingTableLocalTarget = {
  kind: 'table-cell' | 'table-text';
  objectId: string;
  key: string;
  rowIndex?: number;
  columnIndex?: number;
};

export type DrawingConnectorObject = DrawingObjectBase & {
  kind: 'connector';
  label: string;
  pinCount: number;
  gender: 'male' | 'female' | 'receptacle';
  side: 'left' | 'right' | 'none';
};

export type DrawingWireBundleObject = DrawingObjectBase & {
  kind: 'wire-bundle';
  label: string;
  wireCount: number;
  wireKind: 'electronic' | 'twisted' | 'ribbon' | 'parallel' | 'shielded';
};

export type DrawingAccessoryObject = DrawingObjectBase & {
  kind: 'accessory';
  label: string;
  accessoryType: 'sleeve' | 'packaging' | 'specification' | 'model';
};

export type DrawingTextObject = DrawingObjectBase & {
  kind: 'text' | 'label';
  text: string;
};

export type DrawingDimensionObject = DrawingObjectBase & {
  kind: 'dimension';
  label: string;
  start: DrawingPoint;
  end: DrawingPoint;
};

export type DrawingLineObject = DrawingObjectBase & {
  kind: 'line' | 'polyline' | 'curve' | 'freehand';
  name?: string;
  points: DrawingPoint[];
  orthogonal: boolean;
};

export type DrawingTableObject = DrawingObjectBase & DrawingTableLayoutFields & {
  kind: 'table';
  title: string;
  columns: string[];
  rows: DrawingTableRow[];
  textOffsets?: DrawingTableTextOffsets;
};

export type DrawingBomTableObject = DrawingObjectBase & DrawingTableLayoutFields & {
  kind: 'bom-table';
  title: string;
  columns: string[];
  rows: DrawingTableRow[];
  textOffsets?: DrawingTableTextOffsets;
};

export type DrawingWiringTableObject = DrawingObjectBase & DrawingTableLayoutFields & {
  kind: 'wiring-table';
  title: string;
  columns: string[];
  rows: DrawingTableRow[];
  textOffsets?: DrawingTableTextOffsets;
};

export type DrawingTechRequirementsObject = DrawingObjectBase & {
  kind: 'tech-requirements';
  requirements: string[];
};

export type DrawingTitleBlockObject = DrawingObjectBase & {
  kind: 'title-block';
  title: string;
  drawingNo: string;
  revision: string;
};

export type DrawingGroupObject = DrawingObjectBase & {
  kind: 'group';
  groupKind: 'wire-bundle' | 'wire-core';
  children: DrawingObject[];
};

export type DrawingIconObject = DrawingObjectBase & {
  kind: 'icon';
  name: string;
  svgPath: string;
};

export type DrawingObject =
  | DrawingConnectorObject
  | DrawingWireBundleObject
  | DrawingAccessoryObject
  | DrawingTextObject
  | DrawingDimensionObject
  | DrawingLineObject
  | DrawingTableObject
  | DrawingBomTableObject
  | DrawingWiringTableObject
  | DrawingTechRequirementsObject
  | DrawingGroupObject
  | DrawingIconObject
  | DrawingTitleBlockObject;

export type DrawingSelection = { objectIds: string[] };
export type DrawingLayerAction = 'front' | 'forward' | 'backward' | 'back';
export type DrawingToolMode = 'select' | 'line' | 'polyline' | 'curve' | 'freehand';
export type DrawingResourceKind = Exclude<DrawingObjectKind, 'title-block' | 'group' | 'icon'>;

export type DrawingDocument = {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  page: DrawingPage;
  objects: DrawingObject[];
  titleBlock: {
    title: string;
    drawingNo: string;
    revision: string;
  };
  revisionTable: Array<{ revision: string; description: string; date: string }>;
  techRequirements: string[];
  wizardSource?: DrawingWizardDraft;
};

export type DrawingTopology = {
  drawingType: 'internal' | 'external' | 'gallery';
  topology: 'single-end' | 'double-end';
  wireKind: 'electronic' | 'twisted' | 'ribbon' | 'parallel' | 'shielded';
};

export type DrawingConnectorResource = {
  id: string;
  name: string;
  gender: 'male' | 'female' | 'receptacle';
  pinCount: number;
  category: string;
  series: string;
  rowCount: number;
  pitchMm?: number;
  scope: 'public' | 'private';
};

export type DrawingWireDraft = {
  pin: number;
  color: string;
  lengthMm: number;
  wireNo: string;
  connectionNo: string;
  targetPin?: number;
};

export type DrawingWizardDraft = {
  topology: DrawingTopology;
  leftConnector?: DrawingConnectorResource;
  rightConnector?: DrawingConnectorResource;
  singleConnector?: DrawingConnectorResource;
  drawingNo: string;
  totalLengthMm: number;
  toleranceMm: number;
  hasMold: boolean;
  heatShrink?: string;
  heatShrinkResource?: DrawingCatalogResource;
  wires: DrawingWireDraft[];
  wireResource?: DrawingCatalogResource;
  modelResource?: DrawingCatalogResource;
  templateId?: string;
};

export type DrawingCatalogResourceType = 'connector' | 'model' | 'wire' | 'protective_sleeve' | 'accessory' | 'packaging';

export type DrawingCatalogFilters = {
  resourceType?: DrawingCatalogResourceType;
  query?: string;
  gender?: DrawingConnectorResource['gender'];
  resourceGroup?: string;
  series?: string;
  pinCount?: number;
  rowCount?: number;
  pitchMm?: number;
};

export type DrawingCatalogResource = {
  id: string;
  resourceItemId: string;
  resourceType: DrawingCatalogResourceType;
  name: string;
  model: string;
  resourceGroup: string;
  imageUrl?: string;
  imageError?: string;
  gender?: DrawingConnectorResource['gender'];
  series?: string;
  pinCount?: number;
  rowCount?: number;
  pitchMm?: number;
  specification?: string;
  unit?: string;
};

export type DrawingTemplateSummary = {
  id: string;
  name: string;
  category: string;
  description: string;
  thumbnailPath?: string;
  currentVersion: number;
};

export type DrawingCommonPhrase = { id: string; category: string; phrase: string };

export type DrawingIconResource = {
  id: string;
  name: string;
  category: string;
  svgPath: string;
  defaultWidth: number;
  defaultHeight: number;
};
