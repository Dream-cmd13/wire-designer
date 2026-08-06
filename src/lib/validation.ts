// ============================================================
// Harness Design Validation Engine (v3)
// Validates the converged data model: connectors, materials, sleeves.
// ============================================================

import type { HarnessConfig, ValidationIssue } from '@/types/harness';
import { getCatalogSnapshot } from '@/lib/catalogRuntime';
import type { CatalogSnapshot } from '@/types/catalog';
import { getActiveConnectorSide } from '@/lib/commands';
import { JACKET_UL_NUMBERS } from '@/lib/canvasMaterials';

export function validateHarness(config: HarnessConfig, catalog: CatalogSnapshot | null = getCatalogSnapshot()): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  validateConnectors(config, issues, catalog);
  validateMaterialCircuits(config, issues);
  validateJumpers(config, issues);
  validateProtectiveSleeves(config, issues);
  validateUniqueIds(config, issues);
  validateQuantity(config, issues);

  return issues.map((issue, i) => ({
    ...issue,
    id: `val-${i + 1}`,
  }));
}

function validateConnectors(config: HarnessConfig, issues: ValidationIssue[], catalog: CatalogSnapshot | null): void {
  if (config.connectors.length === 0) {
    issues.push({
      id: '',
      severity: 'info',
      code: 'EMPTY_DESIGN',
      entity: { kind: 'project' },
      message: '设计中没有连接器。请添加连接器以开始设计。',
      suggestedAction: '通过画布或工具栏添加连接器',
    });
    return;
  }

  for (const instance of config.connectors) {
    if (!instance.connector) {
      issues.push({
        id: '',
        severity: 'error',
        code: 'MISSING_CONNECTOR',
        entity: { kind: 'connector', id: instance.id },
        message: `连接器 "${instance.label}" 没有关联的型号`,
        suggestedAction: '为此连接器选择一个型号',
      });
      continue;
    }

    const connector = instance.connector;
    if (connector.pinLabels.length !== connector.pinCount) {
      issues.push({
        id: '',
        severity: 'warning',
        code: 'PIN_LABEL_MISMATCH',
        entity: { kind: 'connector', id: instance.id },
        message: `连接器 "${connector.name}" 的 pinCount (${connector.pinCount}) 与 pinLabels 数量 (${connector.pinLabels.length}) 不一致`,
        suggestedAction: '修正连接器数据',
      });
    }

    const catalogEntry = catalog?.connectors.find((c) => c.id === connector.id);
    if (catalog && !catalogEntry) {
      issues.push({
        id: '',
        severity: 'warning',
        code: 'UNKNOWN_CATALOG_PART',
        entity: { kind: 'connector', id: instance.id },
        message: `连接器 "${connector.name}" (${connector.id}) 不在当前目录中`,
        suggestedAction: '更新连接器目录或更换为已知型号',
      });
    }
  }
}

function validateMaterialCircuits(config: HarnessConfig, issues: ValidationIssue[]): void {
  for (const material of config.materials) {
    for (const circuit of material.circuits) {
      // Validate start pin ref
      if (circuit.start) {
        validatePinRef(config, material.id, material.name, circuit.start, '起点', issues);
      }
      // Validate end pin ref
      if (circuit.end) {
        validatePinRef(config, material.id, material.name, circuit.end, '终点', issues);
      }

      // Check: same pin as both start and end on the same connector side
      if (
        circuit.start &&
        circuit.end &&
        circuit.start.connectorId === circuit.end.connectorId &&
        circuit.start.connectorSide === circuit.end.connectorSide &&
        circuit.start.pin === circuit.end.pin
      ) {
        issues.push({
          id: '',
          severity: 'error',
          code: 'CIRCUIT_SELF_LOOP',
          entity: { kind: 'material', id: material.id },
          message: `线材 "${material.name}" 的一条接线明细起点和终点相同`,
          suggestedAction: '修正接线明细',
        });
      }

      // Check side conflict with active side
      for (const ref of [circuit.start, circuit.end]) {
        if (!ref) continue;
        const activeSide = getActiveConnectorSide(config, ref.connectorId);
        if (activeSide !== undefined && activeSide !== ref.connectorSide) {
          issues.push({
            id: '',
            severity: 'error',
            code: 'SIDE_CONFLICT',
            entity: { kind: 'material', id: material.id },
            message: `线材 "${material.name}" 的接线与连接器有效侧冲突`,
            suggestedAction: '删除冲突的接线或调整连接侧',
          });
        }
      }

      // Jacketed wire: check coreIndex
      if (material.spec.kind === 'jacketed' && circuit.coreIndex !== undefined) {
        if (circuit.coreIndex < 0 || circuit.coreIndex >= material.spec.coreCount) {
          issues.push({
            id: '',
            severity: 'error',
            code: 'CORE_INDEX_OUT_OF_RANGE',
            entity: { kind: 'material', id: material.id },
            message: `线材 "${material.name}" 的芯线索引 ${circuit.coreIndex} 超出范围 (0-${material.spec.coreCount - 1})`,
            suggestedAction: '修正芯线索引',
          });
        }
      }
    }

    // Jacketed wire UL validation
    if (material.spec.kind === 'jacketed' && material.spec.ulNumber) {
      if (!JACKET_UL_NUMBERS.includes(material.spec.ulNumber)) {
        issues.push({
          id: '',
          severity: 'warning',
          code: 'UNKNOWN_UL_NUMBER',
          entity: { kind: 'material', id: material.id },
          message: `护套线 "${material.name}" 的 UL 号 ${material.spec.ulNumber} 不在允许列表中`,
          suggestedAction: '选择有效的 UL 号或清除',
        });
      }
    }
  }
}

function validatePinRef(
  config: HarnessConfig,
  materialId: string,
  materialName: string,
  ref: { connectorId: string; connectorSide: 'left' | 'right'; pin: number },
  label: string,
  issues: ValidationIssue[],
): void {
  const instance = config.connectors.find((c) => c.id === ref.connectorId);
  if (!instance) {
    issues.push({
      id: '',
      severity: 'error',
      code: 'DANGLING_CONNECTOR_REF',
      entity: { kind: 'material', id: materialId },
      message: `线材 "${materialName}" 的${label}引用了不存在的连接器 (${ref.connectorId})`,
      suggestedAction: '删除此接线或修正连接器引用',
    });
    return;
  }

  if (ref.pin < 1 || ref.pin > instance.connector.pinCount) {
    issues.push({
      id: '',
      severity: 'error',
      code: 'PIN_OUT_OF_RANGE',
      entity: { kind: 'material', id: materialId },
      message: `线材 "${materialName}" 的${label}PIN (${ref.pin}) 超出连接器 "${instance.label}" 的范围 (1-${instance.connector.pinCount})`,
      suggestedAction: '修正PIN或更换连接器',
    });
  }
}

function validateJumpers(config: HarnessConfig, issues: ValidationIssue[]): void {
  for (const instance of config.connectors) {
    for (const jumper of instance.jumpers) {
      // At least 2 distinct pins
      const uniquePins = new Set(jumper.pins);
      if (uniquePins.size < 2) {
        issues.push({
          id: '',
          severity: 'error',
          code: 'JUMPER_TOO_FEW_PINS',
          entity: { kind: 'connector', id: instance.id },
          message: `连接器 "${instance.label}" 的短接包含的 PIN 少于 2 个`,
          suggestedAction: '删除此短接或添加更多 PIN',
        });
      }

      // Pin range
      for (const pin of jumper.pins) {
        if (pin < 1 || pin > instance.connector.pinCount) {
          issues.push({
            id: '',
            severity: 'error',
            code: 'JUMPER_PIN_OUT_OF_RANGE',
            entity: { kind: 'connector', id: instance.id },
            message: `连接器 "${instance.label}" 的短接 PIN ${pin} 超出范围 (1-${instance.connector.pinCount})`,
            suggestedAction: '修正短接 PIN 或更换连接器',
          });
        }
      }

      // Side conflict
      const activeSide = getActiveConnectorSide(config, instance.id);
      if (activeSide !== undefined && activeSide !== jumper.side) {
        issues.push({
          id: '',
          severity: 'error',
          code: 'JUMPER_SIDE_CONFLICT',
          entity: { kind: 'connector', id: instance.id },
          message: `连接器 "${instance.label}" 的短接与有效侧冲突`,
          suggestedAction: '删除冲突的短接',
        });
      }
    }
  }
}

function validateProtectiveSleeves(config: HarnessConfig, issues: ValidationIssue[]): void {
  for (const sleeve of config.protectiveSleeves) {
    // Corrugated must have material
    if (sleeve.type === 'corrugated' && !sleeve.corrugatedMaterial) {
      issues.push({
        id: '',
        severity: 'warning',
        code: 'CORRUGATED_MISSING_MATERIAL',
        entity: { kind: 'sleeve', id: sleeve.id },
        message: '波纹管未指定材质',
        suggestedAction: '选择 PP、PA 或不锈钢材质',
      });
    }

    // Every explicitly covered material must exist.
    for (const materialId of sleeve.attachedMaterialIds) {
      const exists = config.materials.some((m) => m.id === materialId);
      if (!exists) {
        issues.push({
          id: '',
          severity: 'error',
          code: 'DANGLING_SLEEVE_ATTACHMENT',
          entity: { kind: 'sleeve', id: sleeve.id },
          message: `保护套引用了不存在的线材 (${materialId})`,
          suggestedAction: '解除保护套的线材绑定或删除保护套',
        });
      }
    }

    if (sleeve.lengthMm <= 0) {
      issues.push({
        id: '',
        severity: 'error',
        code: 'INVALID_LENGTH',
        entity: { kind: 'sleeve', id: sleeve.id },
        message: `保护套长度无效 (${sleeve.lengthMm}mm)`,
        suggestedAction: '设置正数长度值',
      });
    }
  }
}

function validateUniqueIds(config: HarnessConfig, issues: ValidationIssue[]): void {
  const ids = new Map<string, string>();

  for (const c of config.connectors) {
    if (ids.has(c.id)) {
      issues.push({
        id: '',
        severity: 'error',
        code: 'DUPLICATE_ID',
        entity: { kind: 'connector', id: c.id },
        message: `重复的连接器 ID: ${c.id}`,
        suggestedAction: '修正数据中的重复 ID',
      });
    }
    ids.set(c.id, 'connector');
  }

  for (const m of config.materials) {
    if (ids.has(m.id)) {
      issues.push({
        id: '',
        severity: 'error',
        code: 'DUPLICATE_ID',
        entity: { kind: 'material', id: m.id },
        message: `重复的线材 ID: ${m.id}`,
        suggestedAction: '修正数据中的重复 ID',
      });
    }
    ids.set(m.id, 'material');
  }

  for (const s of config.protectiveSleeves) {
    if (ids.has(s.id)) {
      issues.push({
        id: '',
        severity: 'error',
        code: 'DUPLICATE_ID',
        entity: { kind: 'sleeve', id: s.id },
        message: `重复的保护套 ID: ${s.id}`,
        suggestedAction: '修正数据中的重复 ID',
      });
    }
    ids.set(s.id, 'sleeve');
  }

  // Circuit IDs (unique within the whole project)
  for (const m of config.materials) {
    for (const c of m.circuits) {
      if (ids.has(c.id)) {
        issues.push({
          id: '',
          severity: 'error',
          code: 'DUPLICATE_CIRCUIT_ID',
          entity: { kind: 'material', id: m.id },
          message: `线材 "${m.name}" 的接线明细 ID 重复: ${c.id}`,
          suggestedAction: '修正数据中的重复 ID',
        });
      }
      ids.set(c.id, 'circuit');
    }
  }

  // Jumper IDs (unique within the whole project)
  for (const conn of config.connectors) {
    for (const j of conn.jumpers) {
      if (ids.has(j.id)) {
        issues.push({
          id: '',
          severity: 'error',
          code: 'DUPLICATE_JUMPER_ID',
          entity: { kind: 'connector', id: conn.id },
          message: `连接器 "${conn.label}" 的短接 ID 重复: ${j.id}`,
          suggestedAction: '修正数据中的重复 ID',
        });
      }
      ids.set(j.id, 'jumper');
    }
  }
}

function validateQuantity(config: HarnessConfig, issues: ValidationIssue[]): void {
  if (config.quantity < 1) {
    issues.push({
      id: '',
      severity: 'error',
      code: 'INVALID_QUANTITY',
      entity: { kind: 'project' },
      message: `生产数量无效 (${config.quantity})`,
      suggestedAction: '设置至少为 1 的生产数量',
    });
  }
}
