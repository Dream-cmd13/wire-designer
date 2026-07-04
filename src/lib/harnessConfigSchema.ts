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
  ProtectiveSleeve,
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
    issues.push(`${path} 必须包含有限数值 x/y`);
    return null;
  }
  return { x: value.x, y: value.y };
}

function readStringArray(value: unknown, path: string, issues: string[]): string[] | null {
  if (!Array.isArray(value) || value.some((item) => !isString(item))) {
    issues.push(`${path} 必须是字符串数组`);
    return null;
  }
  return value;
}

function readEndTreatment(
  value: unknown,
  path: string,
  issues: string[],
): WireEndTreatment | null {
  if (!isRecord(value) || typeof value.stripped !== 'boolean') {
    issues.push(`${path} 缺少 stripped 布尔值`);
    return null;
  }
  if (!value.stripped) {
    return { stripped: false };
  }
  if (value.method === 'tinned' && isPositiveNumber(value.lengthMm)) {
    return { stripped: true, method: 'tinned', lengthMm: value.lengthMm };
  }
  if (value.method === 'terminal' && value.terminalModel === 'cold-press-terminal') {
    return { stripped: true, method: 'terminal', terminalModel: 'cold-press-terminal' };
  }
  issues.push(`${path} 的剥皮方式或参数无效`);
  return null;
}

function readConnector(value: unknown, path: string, issues: string[]): Connector | null {
  if (!isRecord(value)) {
    issues.push(`${path} 必须是对象`);
    return null;
  }
  const type = value.type;
  const pinLabels = readStringArray(value.pinLabels, `${path}.pinLabels`, issues);
  if (
    !isString(value.id)
    || !isString(value.name)
    || !isString(value.manufacturer)
    || !isPositiveInteger(value.pinCount)
    || (type !== 'male' && type !== 'female' && type !== 'receptacle')
    || !pinLabels
    || (value.pitch !== undefined && !isPositiveNumber(value.pitch))
    || (value.image !== undefined && !isString(value.image))
  ) {
    issues.push(`${path} 的连接器字段不完整或类型无效`);
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    manufacturer: value.manufacturer,
    pinCount: value.pinCount,
    ...(value.pitch === undefined ? {} : { pitch: value.pitch }),
    type,
    pinLabels,
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
    issues.push(`${path} 的短接字段无效`);
    return null;
  }
  return { id: value.id, side: value.side, pins: value.pins as number[] };
}

function readConnectorInstance(
  value: unknown,
  path: string,
  issues: string[],
): ConnectorInstance | null {
  if (!isRecord(value) || !isString(value.id) || !isString(value.label)) {
    issues.push(`${path} 的连接器实例字段无效`);
    return null;
  }
  const position = readPosition(value.position, `${path}.position`, issues);
  const connector = readConnector(value.connector, `${path}.connector`, issues);
  if (!Array.isArray(value.jumpers)) {
    issues.push(`${path}.jumpers 必须是数组`);
    return null;
  }
  const jumpers = value.jumpers.map((item, index) =>
    readJumper(item, `${path}.jumpers[${index}]`, issues));
  if (!position || !connector || jumpers.some((item) => !item)) return null;
  return { id: value.id, position, connector, label: value.label, jumpers: jumpers as ConnectorJumper[] };
}

function readEndpoint(value: unknown, path: string, issues: string[]): ConnectorPinRef | null {
  if (
    !isRecord(value)
    || !isString(value.connectorId)
    || (value.connectorSide !== 'left' && value.connectorSide !== 'right')
    || !isPositiveInteger(value.pin)
  ) {
    issues.push(`${path} 的连接器 PIN 引用无效`);
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
    issues.push(`${path} 必须是对象`);
    return null;
  }
  const route: MaterialCircuit['route'] = {};
  for (const endpoint of ['start', 'end'] as const) {
    if (value[endpoint] === undefined) continue;
    const offset = value[endpoint];
    if (!isRecord(offset) || !isFiniteNumber(offset.offsetX) || !isFiniteNumber(offset.offsetY)) {
      issues.push(`${path}.${endpoint} 必须包含有限数值 offsetX/offsetY`);
      return null;
    }
    route[endpoint] = { offsetX: offset.offsetX, offsetY: offset.offsetY };
  }
  return route;
}

function readCircuit(value: unknown, path: string, issues: string[]): MaterialCircuit | null {
  if (!isRecord(value) || !isString(value.id) || !isString(value.color) || !isString(value.signalName)) {
    issues.push(`${path} 的接线明细字段无效`);
    return null;
  }
  const start = value.start === undefined ? undefined : readEndpoint(value.start, `${path}.start`, issues);
  const end = value.end === undefined ? undefined : readEndpoint(value.end, `${path}.end`, issues);
  const route = readRoute(value.route, `${path}.route`, issues);
  if (
    start === null
    || end === null
    || route === null
    || (value.coreIndex !== undefined && (!Number.isInteger(value.coreIndex) || (value.coreIndex as number) < 0))
  ) {
    if (value.coreIndex !== undefined && !Number.isInteger(value.coreIndex)) {
      issues.push(`${path}.coreIndex 必须是非负整数`);
    }
    return null;
  }
  return {
    id: value.id,
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    color: value.color,
    signalName: value.signalName,
    ...(value.coreIndex === undefined ? {} : { coreIndex: value.coreIndex as number }),
    ...(route === undefined ? {} : { route }),
  };
}

function readWireSpec(value: unknown, path: string, issues: string[]): CanvasWireSpec | null {
  if (!isRecord(value)) {
    issues.push(`${path} 必须是对象`);
    return null;
  }
  const endTreatment = readEndTreatment(value.endTreatment, `${path}.endTreatment`, issues);
  if (!endTreatment || !isPositiveNumber(value.lengthMm) || !isPositiveNumber(value.awg)) {
    issues.push(`${path} 的长度或 AWG 无效`);
    return null;
  }
  if (value.kind === 'electronic') {
    if (!isString(value.color) || value.ulNumber !== '1007') {
      issues.push(`${path} 的电子线字段无效`);
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
  const allowedCoreCounts = [1, 2, 3, 4, 5, 6, 8, 12, 17];
  const coreColors = readStringArray(value.coreColors, `${path}.coreColors`, issues);
  if (
    value.kind !== 'jacketed'
    || (value.jacketMaterial !== 'PVC' && value.jacketMaterial !== 'PVR')
    || (value.jacketColor !== 'black' && value.jacketColor !== 'green')
    || !allowedCoreCounts.includes(value.coreCount as number)
    || typeof value.shielded !== 'boolean'
    || !isPositiveNumber(value.odMm)
    || !coreColors
    || (value.ulNumber !== undefined && value.ulNumber !== 'UL2464' && value.ulNumber !== 'UL20276')
  ) {
    issues.push(`${path} 的护套线字段无效`);
    return null;
  }
  return {
    kind: 'jacketed',
    jacketMaterial: value.jacketMaterial,
    jacketColor: value.jacketColor,
    awg: value.awg,
    coreCount: value.coreCount as 1 | 2 | 3 | 4 | 5 | 6 | 8 | 12 | 17,
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
    || value.material !== '五防热敏纸标签纸'
    || !isString(value.content)
    || !isPositiveNumber(value.lengthMm)
  ) {
    issues.push(`${path} 的标签字段无效`);
    return null;
  }
  return {
    id: value.id,
    material: '五防热敏纸标签纸',
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
  ) {
    issues.push(`${path} 的号码管字段无效`);
    return null;
  }
  return {
    id: value.id,
    content: value.content,
    lengthMm: value.lengthMm,
    ...(value.circuitId === undefined ? {} : { circuitId: value.circuitId }),
    ...(value.endpoint === undefined ? {} : { endpoint: value.endpoint }),
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
    issues.push(`${path} 的线材字段无效`);
    return null;
  }
  const position = readPosition(value.position, `${path}.position`, issues);
  const spec = readWireSpec(value.spec, `${path}.spec`, issues);
  const circuits = value.circuits.map((item, index) =>
    readCircuit(item, `${path}.circuits[${index}]`, issues));
  const rawLabels = value.labels ?? [];
  const rawNumberTubes = value.numberTubes ?? [];
  if (!Array.isArray(rawLabels) || !Array.isArray(rawNumberTubes)) {
    issues.push(`${path} 的标签和号码管必须是数组`);
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
  ) return null;
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
  ) {
    issues.push(`${path} 的保护套字段无效`);
    return null;
  }
  const position = readPosition(value.position, `${path}.position`, issues);
  const attachedMaterialIds = readStringArray(
    value.attachedMaterialIds,
    `${path}.attachedMaterialIds`,
    issues,
  );
  if (!position || !attachedMaterialIds) return null;
  return {
    id: value.id,
    type: value.type as ProtectiveSleeve['type'],
    ...(value.corrugatedMaterial === undefined
      ? {}
      : { corrugatedMaterial: value.corrugatedMaterial as ProtectiveSleeve['corrugatedMaterial'] }),
    position,
    width: value.width,
    height: value.height,
    lengthMm: value.lengthMm,
    attachedMaterialIds,
  };
}

function readModel(value: unknown, path: string, issues: string[]): CanvasModel | null {
  if (
    !isRecord(value)
    || !isString(value.id)
    || value.kind !== 'outer-box'
    || !isPositiveNumber(value.width)
    || !isPositiveNumber(value.height)
  ) {
    issues.push(`${path} 的外模字段无效`);
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
  };
}

export function parseHarnessConfig(input: unknown): HarnessConfigParseResult {
  const issues: string[] = [];
  if (!isRecord(input)) {
    return { success: false, issues: ['根节点必须是对象'] };
  }
  if (input.schemaVersion !== 3) issues.push('schemaVersion 必须为 3');
  if (!isString(input.id)) issues.push('id 必须是字符串');
  if (!isString(input.name)) issues.push('name 必须是字符串');
  if (!isFiniteNumber(input.createdAt)) issues.push('createdAt 必须是有限数值');
  if (!isFiniteNumber(input.updatedAt)) issues.push('updatedAt 必须是有限数值');
  if (!isPositiveInteger(input.quantity)) issues.push('quantity 必须是正整数');
  if (input.leadTime !== 'rush' && input.leadTime !== 'standard' && input.leadTime !== 'economy') {
    issues.push('leadTime 必须是 rush、standard 或 economy');
  }
  for (const key of ['connectors', 'materials', 'protectiveSleeves', 'models'] as const) {
    if (!Array.isArray(input[key])) issues.push(`${key} 必须是数组`);
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

  if (
    issues.length > 0
    || connectors.some((item) => !item)
    || materials.some((item) => !item)
    || protectiveSleeves.some((item) => !item)
    || models.some((item) => !item)
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
      leadTime: input.leadTime as HarnessConfig['leadTime'],
    },
  };
}
