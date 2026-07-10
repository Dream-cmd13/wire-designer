import type {
  CanvasModel,
  CanvasWireMaterial,
  CanvasWireSpec,
  Connector,
  ConnectorInstance,
  ConnectorJumper,
  ConnectorPinRef,
  HarnessConfig,
  MaterialCircuit,
  ProductionDrawing,
  ProductionDrawingObject,
  ProtectiveSleeve,
  TwoDImage,
  WireEndTreatment,
  WireLabel,
  WireNumberTube,
} from '@/types/harness';

export type HarnessConfigParseResult =
  | { success: true; data: HarnessConfig }
  | { success: false; issues: string[] };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && isPositiveNumber(value);
}

function readPosition(value: unknown, path: string, issues: string[]) {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
    issues.push(`${path} must include finite x/y coordinates`);
    return null;
  }
  return { x: value.x, y: value.y };
}

function readStringArray(value: unknown, path: string, issues: string[]): string[] | null {
  if (!Array.isArray(value) || value.some((item) => !isString(item))) {
    issues.push(`${path} must be a string array`);
    return null;
  }
  return value;
}

function readEndTreatment(
  value: unknown,
  path: string,
  issues: string[],
): WireEndTreatment | null {
  const readEnd = (endValue: unknown, endPath: string) => {
    if (!isRecord(endValue) || typeof endValue.stripped !== 'boolean') {
      issues.push(`${endPath} must include boolean stripped`);
      return null;
    }

    if (!endValue.stripped) {
      return {
        stripped: false,
        termination: 'none' as const,
      };
    }

    if (!isPositiveNumber(endValue.stripLengthMm)) {
      issues.push(`${endPath}.stripLengthMm must be a positive number`);
      return null;
    }

    if (
      endValue.termination !== 'none'
      && endValue.termination !== 'tinned'
      && endValue.termination !== 'terminal'
    ) {
      issues.push(`${endPath}.termination is invalid`);
      return null;
    }

    if (
      endValue.termination === 'terminal'
      && endValue.terminalModel !== 'cold-press-terminal'
    ) {
      issues.push(`${endPath}.terminalModel is invalid`);
      return null;
    }

    return {
      stripped: true,
      stripLengthMm: endValue.stripLengthMm,
      termination: endValue.termination as 'none' | 'tinned' | 'terminal',
      ...(endValue.termination === 'terminal'
        ? { terminalModel: 'cold-press-terminal' as const }
        : {}),
    };
  };

  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return null;
  }

  if ('start' in value || 'end' in value) {
    const start = readEnd(value.start, `${path}.start`);
    const end = readEnd(value.end, `${path}.end`);
    return start && end ? { start, end } : null;
  }

  // Backward-compatible parser for the previous single-value format.
  if (typeof value.stripped !== 'boolean') {
    issues.push(`${path} must include start/end or legacy stripped`);
    return null;
  }

  if (!value.stripped) {
    return {
      start: { stripped: false, termination: 'none' },
      end: { stripped: false, termination: 'none' },
    };
  }

  if (value.method === 'tinned' && isPositiveNumber(value.lengthMm)) {
    return {
      start: { stripped: true, stripLengthMm: value.lengthMm, termination: 'tinned' },
      end: { stripped: true, stripLengthMm: value.lengthMm, termination: 'tinned' },
    };
  }

  if (value.method === 'terminal' && value.terminalModel === 'cold-press-terminal') {
    return {
      start: {
        stripped: true,
        stripLengthMm: 3,
        termination: 'terminal',
        terminalModel: 'cold-press-terminal',
      },
      end: {
        stripped: true,
        stripLengthMm: 3,
        termination: 'terminal',
        terminalModel: 'cold-press-terminal',
      },
    };
  }

  issues.push(`${path} legacy value is invalid`);
  return null;
}

function readConnector(value: unknown, path: string, issues: string[]): Connector | null {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return null;
  }

  const pinLabels = readStringArray(value.pinLabels, `${path}.pinLabels`, issues);
  if (
    !isString(value.id)
    || !isString(value.name)
    || !isString(value.manufacturer)
    || !isPositiveInteger(value.pinCount)
    || (value.type !== 'male' && value.type !== 'female' && value.type !== 'receptacle')
    || !pinLabels
    || (value.pitch !== undefined && !isPositiveNumber(value.pitch))
    || (value.image !== undefined && !isString(value.image))
  ) {
    issues.push(`${path} is not a valid connector`);
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    manufacturer: value.manufacturer,
    pinCount: value.pinCount,
    type: value.type,
    pinLabels,
    ...(value.pitch === undefined ? {} : { pitch: value.pitch }),
    ...(value.image === undefined ? {} : { image: value.image }),
  };
}

function readJumper(value: unknown, path: string, issues: string[]): ConnectorJumper | null {
  if (
    !isRecord(value)
    || !isString(value.id)
    || (value.side !== 'left' && value.side !== 'right')
    || !Array.isArray(value.pins)
    || value.pins.some((pin) => !isPositiveInteger(pin))
  ) {
    issues.push(`${path} is not a valid jumper`);
    return null;
  }

  return {
    id: value.id,
    side: value.side,
    pins: value.pins as number[],
  };
}

function readConnectorInstance(
  value: unknown,
  path: string,
  issues: string[],
): ConnectorInstance | null {
  if (!isRecord(value) || !isString(value.id) || !isString(value.label)) {
    issues.push(`${path} is not a valid connector instance`);
    return null;
  }

  const position = readPosition(value.position, `${path}.position`, issues);
  const connector = readConnector(value.connector, `${path}.connector`, issues);
  if (!Array.isArray(value.jumpers)) {
    issues.push(`${path}.jumpers must be an array`);
    return null;
  }

  const jumpers = value.jumpers.map((item, index) =>
    readJumper(item, `${path}.jumpers[${index}]`, issues));

  if (!position || !connector || jumpers.some((item) => !item)) {
    return null;
  }

  return {
    id: value.id,
    position,
    connector,
    label: value.label,
    jumpers: jumpers as ConnectorJumper[],
  };
}

function readEndpoint(value: unknown, path: string, issues: string[]): ConnectorPinRef | null {
  if (
    !isRecord(value)
    || !isString(value.connectorId)
    || (value.connectorSide !== 'left' && value.connectorSide !== 'right')
    || !isPositiveInteger(value.pin)
  ) {
    issues.push(`${path} is not a valid connector pin reference`);
    return null;
  }

  return {
    connectorId: value.connectorId,
    connectorSide: value.connectorSide,
    pin: value.pin,
  };
}

function readRoute(value: unknown, path: string, issues: string[]) {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return null;
  }

  const route: MaterialCircuit['route'] = {};
  for (const endpoint of ['start', 'end'] as const) {
    if (value[endpoint] === undefined) continue;
    const offset = value[endpoint];
    if (!isRecord(offset) || !isFiniteNumber(offset.offsetX) || !isFiniteNumber(offset.offsetY)) {
      issues.push(`${path}.${endpoint} must include finite offsetX/offsetY`);
      return null;
    }
    route[endpoint] = { offsetX: offset.offsetX, offsetY: offset.offsetY };
  }

  return route;
}

function readCircuit(value: unknown, path: string, issues: string[]): MaterialCircuit | null {
  if (!isRecord(value) || !isString(value.id) || !isString(value.color) || !isString(value.signalName)) {
    issues.push(`${path} is not a valid circuit`);
    return null;
  }

  const start = value.start === undefined ? undefined : readEndpoint(value.start, `${path}.start`, issues);
  const end = value.end === undefined ? undefined : readEndpoint(value.end, `${path}.end`, issues);
  const route = readRoute(value.route, `${path}.route`, issues);

  if (
    start === null
    || end === null
    || route === null
    || (value.lengthMm !== undefined && !isPositiveNumber(value.lengthMm))
    || (value.connectionNo !== undefined && !isString(value.connectionNo))
    || (value.coreIndex !== undefined && (!Number.isInteger(value.coreIndex) || (value.coreIndex as number) < 0))
  ) {
    issues.push(`${path} has invalid optional circuit fields`);
    return null;
  }

  return {
    id: value.id,
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    color: value.color,
    signalName: value.signalName,
    ...(value.lengthMm === undefined ? {} : { lengthMm: value.lengthMm as number }),
    ...(value.connectionNo === undefined ? {} : { connectionNo: value.connectionNo as string }),
    ...(value.coreIndex === undefined ? {} : { coreIndex: value.coreIndex as number }),
    ...(route === undefined ? {} : { route }),
  };
}

function readWireSpec(value: unknown, path: string, issues: string[]): CanvasWireSpec | null {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return null;
  }

  const endTreatment = readEndTreatment(value.endTreatment, `${path}.endTreatment`, issues);
  if (!endTreatment || !isPositiveNumber(value.lengthMm) || !isPositiveNumber(value.awg)) {
    issues.push(`${path} has invalid length or awg`);
    return null;
  }

  if (value.kind === 'electronic') {
    if (!isString(value.color) || value.ulNumber !== '1007') {
      issues.push(`${path} is not a valid electronic wire spec`);
      return null;
    }

    return {
      kind: 'electronic',
      color: value.color,
      lengthMm: value.lengthMm,
      awg: value.awg,
      ulNumber: '1007',
      endTreatment,
    };
  }

  const coreColors = readStringArray(value.coreColors, `${path}.coreColors`, issues);
  const coreCount = value.coreCount as number;
  if (
    value.kind !== 'jacketed'
    || (value.jacketMaterial !== 'PVC' && value.jacketMaterial !== 'PUR' && value.jacketMaterial !== 'PVR')
    || (value.jacketColor !== 'black' && value.jacketColor !== 'green')
    || !Number.isInteger(coreCount)
    || coreCount < 1
    || coreCount > 100
    || typeof value.shielded !== 'boolean'
    || !isPositiveNumber(value.odMm)
    || !coreColors
    || coreColors.length !== coreCount
    || (value.ulNumber !== undefined && value.ulNumber !== 'UL2464' && value.ulNumber !== 'UL20276')
  ) {
    issues.push(`${path} is not a valid jacketed wire spec`);
    return null;
  }

  return {
    kind: 'jacketed',
    jacketMaterial: value.jacketMaterial === 'PVR' ? 'PUR' : value.jacketMaterial,
    jacketColor: value.jacketColor,
    awg: value.awg,
    coreCount,
    shielded: value.shielded,
    odMm: value.odMm,
    coreColors,
    endTreatment,
    lengthMm: value.lengthMm,
    ...(value.ulNumber === undefined ? {} : { ulNumber: value.ulNumber }),
  };
}

function readLabel(value: unknown, path: string, issues: string[]): WireLabel | null {
  if (
    !isRecord(value)
    || !isString(value.id)
    || !isString(value.material)
    || !isString(value.content)
    || !isPositiveNumber(value.lengthMm)
  ) {
    issues.push(`${path} is not a valid wire label`);
    return null;
  }

  return {
    id: value.id,
    material: value.material,
    content: value.content,
    lengthMm: value.lengthMm,
  };
}

function readNumberTube(value: unknown, path: string, issues: string[]): WireNumberTube | null {
  if (
    !isRecord(value)
    || !isString(value.id)
    || !isString(value.content)
    || !isPositiveNumber(value.lengthMm)
    || (value.circuitId !== undefined && !isString(value.circuitId))
    || (value.endpoint !== undefined && value.endpoint !== 'start' && value.endpoint !== 'end')
    || (value.distanceMm !== undefined && !isFiniteNumber(value.distanceMm))
  ) {
    issues.push(`${path} is not a valid number tube`);
    return null;
  }

  return {
    id: value.id,
    content: value.content,
    lengthMm: value.lengthMm,
    ...(value.circuitId === undefined ? {} : { circuitId: value.circuitId }),
    ...(value.endpoint === undefined ? {} : { endpoint: value.endpoint }),
    ...(value.distanceMm === undefined ? {} : { distanceMm: value.distanceMm }),
  };
}

function readMaterial(value: unknown, path: string, issues: string[]): CanvasWireMaterial | null {
  if (
    !isRecord(value)
    || !isString(value.id)
    || !isString(value.name)
    || !isPositiveNumber(value.width)
    || !Array.isArray(value.circuits)
    || (value.expandedByDefault !== undefined && typeof value.expandedByDefault !== 'boolean')
  ) {
    issues.push(`${path} is not a valid material`);
    return null;
  }

  const position = readPosition(value.position, `${path}.position`, issues);
  const spec = readWireSpec(value.spec, `${path}.spec`, issues);
  const circuits = value.circuits.map((item, index) =>
    readCircuit(item, `${path}.circuits[${index}]`, issues));
  const rawLabels = value.labels ?? [];
  const rawNumberTubes = value.numberTubes ?? [];

  if (!Array.isArray(rawLabels) || !Array.isArray(rawNumberTubes)) {
    issues.push(`${path}.labels and ${path}.numberTubes must be arrays`);
    return null;
  }

  const labels = rawLabels.map((item, index) => readLabel(item, `${path}.labels[${index}]`, issues));
  const numberTubes = rawNumberTubes.map((item, index) =>
    readNumberTube(item, `${path}.numberTubes[${index}]`, issues));

  if (
    !position
    || !spec
    || circuits.some((item) => !item)
    || labels.some((item) => !item)
    || numberTubes.some((item) => !item)
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    position,
    width: value.width,
    spec,
    circuits: circuits as MaterialCircuit[],
    labels: labels as WireLabel[],
    numberTubes: numberTubes as WireNumberTube[],
    ...(value.expandedByDefault === undefined ? {} : { expandedByDefault: value.expandedByDefault }),
  };
}

function readSleeve(value: unknown, path: string, issues: string[]): ProtectiveSleeve | null {
  const allowedTypes = ['acetate-cloth', 'fleece', 'heat-shrink', 'braided', 'corrugated'];
  const allowedMaterials = ['PP', 'PA', 'stainless-steel'];

  if (
    !isRecord(value)
    || !isString(value.id)
    || !allowedTypes.includes(value.type as string)
    || (value.corrugatedMaterial !== undefined && !allowedMaterials.includes(value.corrugatedMaterial as string))
    || !isPositiveNumber(value.width)
    || !isPositiveNumber(value.height)
    || !isPositiveNumber(value.lengthMm)
    || (value.remark !== undefined && !isString(value.remark))
  ) {
    issues.push(`${path} is not a valid sleeve`);
    return null;
  }

  const position = readPosition(value.position, `${path}.position`, issues);
  const attachedMaterialIds = readStringArray(value.attachedMaterialIds, `${path}.attachedMaterialIds`, issues);

  let corrugatedFixing: ProtectiveSleeve['corrugatedFixing'] | undefined;
  if (value.corrugatedFixing !== undefined) {
    if (
      !isRecord(value.corrugatedFixing)
      || typeof value.corrugatedFixing.startHeatShrink !== 'boolean'
      || typeof value.corrugatedFixing.endHeatShrink !== 'boolean'
      || !isFiniteNumber(value.corrugatedFixing.startDistanceMm)
      || !isFiniteNumber(value.corrugatedFixing.endDistanceMm)
    ) {
      issues.push(`${path}.corrugatedFixing is invalid`);
      return null;
    }

    corrugatedFixing = {
      startHeatShrink: value.corrugatedFixing.startHeatShrink,
      endHeatShrink: value.corrugatedFixing.endHeatShrink,
      startDistanceMm: value.corrugatedFixing.startDistanceMm,
      endDistanceMm: value.corrugatedFixing.endDistanceMm,
    };
  }

  if (!position || !attachedMaterialIds) {
    return null;
  }

  return {
    id: value.id,
    type: value.type as ProtectiveSleeve['type'],
    ...(value.corrugatedMaterial === undefined
      ? {}
      : { corrugatedMaterial: value.corrugatedMaterial as ProtectiveSleeve['corrugatedMaterial'] }),
    ...(corrugatedFixing === undefined ? {} : { corrugatedFixing }),
    position,
    width: value.width,
    height: value.height,
    lengthMm: value.lengthMm,
    attachedMaterialIds,
    ...(value.remark === undefined ? {} : { remark: value.remark }),
  };
}

function readModel(value: unknown, path: string, issues: string[]): CanvasModel | null {
  if (
    !isRecord(value)
    || !isString(value.id)
    || value.kind !== 'outer-box'
    || !isPositiveNumber(value.width)
    || !isPositiveNumber(value.height)
    || (value.overmoldSpecId !== undefined && !isString(value.overmoldSpecId))
  ) {
    issues.push(`${path} is not a valid canvas model`);
    return null;
  }

  const position = readPosition(value.position, `${path}.position`, issues);
  if (!position) return null;

  return {
    id: value.id,
    kind: 'outer-box',
    position,
    width: value.width,
    height: value.height,
    ...(value.overmoldSpecId === undefined ? {} : { overmoldSpecId: value.overmoldSpecId }),
  };
}

function readProductionDrawingObjectBase(value: UnknownRecord, path: string, issues: string[]) {
  if (
    !isString(value.id)
    || !isFiniteNumber(value.x)
    || !isFiniteNumber(value.y)
    || !isPositiveNumber(value.width)
    || !isPositiveNumber(value.height)
  ) {
    issues.push(`${path} has invalid object geometry`);
    return null;
  }

  return {
    id: value.id,
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
  };
}

function readProductionDrawingObject(
  value: unknown,
  path: string,
  issues: string[],
): ProductionDrawingObject | null {
  if (!isRecord(value) || !isString(value.kind)) {
    issues.push(`${path} is not a valid production drawing object`);
    return null;
  }

  const base = readProductionDrawingObjectBase(value, path, issues);
  if (!base) return null;

  if (value.kind === 'connector') {
    if (
      !isString(value.connectorId)
      || !isString(value.label)
      || !isPositiveInteger(value.pinCount)
      || (value.side !== 'left' && value.side !== 'right' && value.side !== 'none')
    ) {
      issues.push(`${path} is not a valid connector drawing object`);
      return null;
    }
    return {
      ...base,
      kind: 'connector',
      connectorId: value.connectorId,
      label: value.label,
      pinCount: value.pinCount,
      side: value.side,
    };
  }

  if (value.kind === 'wire-bundle') {
    const materialIds = readStringArray(value.materialIds, `${path}.materialIds`, issues);
    if (!materialIds || !isPositiveInteger(value.wireCount) || typeof value.jacketed !== 'boolean') {
      issues.push(`${path} is not a valid wire bundle drawing object`);
      return null;
    }
    return {
      ...base,
      kind: 'wire-bundle',
      materialIds,
      wireCount: value.wireCount,
      jacketed: value.jacketed,
    };
  }

  if (value.kind === 'dimension') {
    if (!isString(value.label)) {
      issues.push(`${path} is not a valid dimension drawing object`);
      return null;
    }
    return { ...base, kind: 'dimension', label: value.label };
  }

  if (value.kind === 'text') {
    if (!isString(value.text) || !isPositiveNumber(value.fontSize)) {
      issues.push(`${path} is not a valid text drawing object`);
      return null;
    }
    return { ...base, kind: 'text', text: value.text, fontSize: value.fontSize };
  }

  if (value.kind === 'bom-table') {
    if (!Array.isArray(value.rows)) {
      issues.push(`${path}.rows must be an array`);
      return null;
    }
    const rows = value.rows.map((row, index) => {
      if (
        !isRecord(row)
        || !isPositiveInteger(row.item)
        || !isString(row.description)
        || !isPositiveNumber(row.quantity)
      ) {
        issues.push(`${path}.rows[${index}] is not a valid BOM row`);
        return null;
      }
      return {
        item: row.item,
        description: row.description,
        quantity: row.quantity,
      };
    });
    if (rows.some((row) => !row)) return null;
    return {
      ...base,
      kind: 'bom-table',
      rows: rows as Extract<ProductionDrawingObject, { kind: 'bom-table' }>['rows'],
    };
  }

  if (value.kind === 'wiring-table') {
    if (!Array.isArray(value.rows)) {
      issues.push(`${path}.rows must be an array`);
      return null;
    }
    const rows = value.rows.map((row, index) => {
      if (
        !isRecord(row)
        || !isPositiveInteger(row.item)
        || !isString(row.color)
        || !isString(row.signalName)
        || !isString(row.connectionNo)
        || (row.startPin !== undefined && !isPositiveInteger(row.startPin))
        || (row.endPin !== undefined && !isPositiveInteger(row.endPin))
        || (row.lengthMm !== undefined && !isPositiveNumber(row.lengthMm))
      ) {
        issues.push(`${path}.rows[${index}] is not a valid wiring table row`);
        return null;
      }
      return {
        item: row.item,
        color: row.color,
        signalName: row.signalName,
        connectionNo: row.connectionNo,
        ...(row.startPin === undefined ? {} : { startPin: row.startPin }),
        ...(row.endPin === undefined ? {} : { endPin: row.endPin }),
        ...(row.lengthMm === undefined ? {} : { lengthMm: row.lengthMm }),
      };
    });
    if (rows.some((row) => !row)) return null;
    return {
      ...base,
      kind: 'wiring-table',
      rows: rows as Extract<ProductionDrawingObject, { kind: 'wiring-table' }>['rows'],
    };
  }

  if (value.kind === 'title-block') {
    if (!isString(value.title) || !isString(value.drawingNo) || !isString(value.revision)) {
      issues.push(`${path} is not a valid title block drawing object`);
      return null;
    }
    return {
      ...base,
      kind: 'title-block',
      title: value.title,
      drawingNo: value.drawingNo,
      revision: value.revision,
    };
  }

  if (value.kind === 'tech-requirements') {
    const requirements = readStringArray(value.requirements, `${path}.requirements`, issues);
    if (!requirements) {
      issues.push(`${path} is not a valid tech requirements drawing object`);
      return null;
    }
    return { ...base, kind: 'tech-requirements', requirements };
  }

  issues.push(`${path}.kind is not supported`);
  return null;
}

function readProductionDrawing(value: unknown, path: string, issues: string[]): ProductionDrawing | null {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return null;
  }

  if (
    value.schemaVersion !== 1
    || !isRecord(value.page)
    || value.page.size !== 'A4'
    || value.page.orientation !== 'landscape'
    || value.page.width !== 1200
    || value.page.height !== 800
    || !Array.isArray(value.objects)
    || !Array.isArray(value.revisionTable)
    || !isRecord(value.titleBlock)
    || !Array.isArray(value.techRequirements)
  ) {
    issues.push(`${path} is not a valid production drawing`);
    return null;
  }

  const objects = value.objects.map((item, index) =>
    readProductionDrawingObject(item, `${path}.objects[${index}]`, issues));
  const revisionTable = value.revisionTable.map((row, index) => {
    if (
      !isRecord(row)
      || !isString(row.revision)
      || !isString(row.description)
      || !isString(row.date)
    ) {
      issues.push(`${path}.revisionTable[${index}] is not a valid revision row`);
      return null;
    }
    return {
      revision: row.revision,
      description: row.description,
      date: row.date,
    };
  });
  const techRequirements = readStringArray(value.techRequirements, `${path}.techRequirements`, issues);

  if (
    !isString(value.titleBlock.title)
    || !isString(value.titleBlock.drawingNo)
    || !isString(value.titleBlock.revision)
    || objects.some((object) => !object)
    || revisionTable.some((row) => !row)
    || !techRequirements
  ) {
    issues.push(`${path} has invalid nested data`);
    return null;
  }

  return {
    schemaVersion: 1,
    page: {
      size: 'A4',
      orientation: 'landscape',
      width: 1200,
      height: 800,
    },
    objects: objects as ProductionDrawingObject[],
    revisionTable: revisionTable as ProductionDrawing['revisionTable'],
    titleBlock: {
      title: value.titleBlock.title,
      drawingNo: value.titleBlock.drawingNo,
      revision: value.titleBlock.revision,
    },
    techRequirements,
  };
}

export function parseHarnessConfig(input: unknown): HarnessConfigParseResult {
  const issues: string[] = [];

  if (!isRecord(input)) {
    return { success: false, issues: ['Root must be an object'] };
  }

  if (input.schemaVersion !== 3) issues.push('schemaVersion must equal 3');
  if (!isString(input.id)) issues.push('id must be a string');
  if (!isString(input.name)) issues.push('name must be a string');
  if (!isFiniteNumber(input.createdAt)) issues.push('createdAt must be finite');
  if (!isFiniteNumber(input.updatedAt)) issues.push('updatedAt must be finite');
  if (!isPositiveInteger(input.quantity)) issues.push('quantity must be a positive integer');
  if (input.leadTime !== 'rush' && input.leadTime !== 'standard' && input.leadTime !== 'economy') {
    issues.push('leadTime must be rush, standard, or economy');
  }

  for (const key of ['connectors', 'materials', 'protectiveSleeves', 'models'] as const) {
    if (!Array.isArray(input[key])) issues.push(`${key} must be an array`);
  }

  if (issues.length > 0) return { success: false, issues };

  const connectors = (input.connectors as unknown[]).map((item, index) =>
    readConnectorInstance(item, `connectors[${index}]`, issues));
  const materials = (input.materials as unknown[]).map((item, index) =>
    readMaterial(item, `materials[${index}]`, issues));
  const protectiveSleeves = (input.protectiveSleeves as unknown[]).map((item, index) =>
    readSleeve(item, `protectiveSleeves[${index}]`, issues));
  const models = (input.models as unknown[]).map((item, index) =>
    readModel(item, `models[${index}]`, issues));
  const productionDrawing = input.productionDrawing === undefined
    ? undefined
    : readProductionDrawing(input.productionDrawing, 'productionDrawing', issues);

  if (
    connectors.some((item) => !item)
    || materials.some((item) => !item)
    || protectiveSleeves.some((item) => !item)
    || models.some((item) => !item)
    || productionDrawing === null
  ) {
    return { success: false, issues };
  }

  return {
    success: true,
    data: {
      schemaVersion: 3,
      id: input.id as string,
      name: input.name as string,
      createdAt: input.createdAt as number,
      updatedAt: input.updatedAt as number,
      connectors: connectors as ConnectorInstance[],
      materials: materials as CanvasWireMaterial[],
      protectiveSleeves: protectiveSleeves as ProtectiveSleeve[],
      models: models as CanvasModel[],
      quantity: input.quantity as number,
      leadTime: input.leadTime as 'rush' | 'standard' | 'economy',
      twoDImages: Array.isArray((input as Record<string, unknown>).twoDImages)
        ? ((input as Record<string, unknown>).twoDImages as unknown[]).filter(
            (x) =>
              x !== null &&
              typeof x === 'object' &&
              typeof (x as Record<string, unknown>).id === 'string' &&
              typeof (x as Record<string, unknown>).dataUrl === 'string',
          ) as TwoDImage[]
        : [],
      ...(productionDrawing === undefined ? {} : { productionDrawing }),
    },
  };
}
