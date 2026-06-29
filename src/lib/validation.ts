// ============================================================
// Harness Design Validation Engine
// Pure function that checks a HarnessConfig for structural
// integrity issues, PIN violations, dangling references, etc.
// ============================================================

import type { HarnessConfig, ValidationIssue } from '@/types/harness';
import { CONNECTORS } from '@/lib/data';

// ============================================================
// Main Validation Function
// ============================================================

export function validateHarness(config: HarnessConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Validate nodes
  validateNodes(config, issues);

  // Validate connections
  validateConnections(config, issues);

  // Validate wires
  validateWires(config, issues);

  // Validate cross-references
  validateCrossReferences(config, issues);

  // Validate catalog consistency
  validateCatalogConsistency(config, issues);

  // Assign unique IDs
  return issues.map((issue, i) => ({
    ...issue,
    id: `val-${i + 1}`,
  }));
}

// ============================================================
// Individual Validation Functions
// ============================================================

function validateNodes(config: HarnessConfig, issues: ValidationIssue[]): void {
  if (config.nodes.length === 0) {
    issues.push({
      id: '',
      severity: 'info',
      code: 'EMPTY_DESIGN',
      entity: { kind: 'project' },
      message: '设计中没有连接器节点。请添加连接器以开始设计。',
      suggestedAction: '通过画布或工具栏添加连接器节点',
    });
    return;
  }

  for (const node of config.nodes) {
    // Check connector exists
    if (!node.connector) {
      issues.push({
        id: '',
        severity: 'error',
        code: 'MISSING_CONNECTOR',
        entity: { kind: 'node', id: node.id },
        message: `节点 "${node.label}" 没有关联的连接器`,
        suggestedAction: '为此节点选择一个连接器型号',
      });
      continue;
    }

    const connector = node.connector!; // narrowed by continue above

    // Check pin count vs pin labels
    if (connector.pinLabels.length !== connector.pinCount) {
      issues.push({
        id: '',
        severity: 'warning',
        code: 'PIN_LABEL_MISMATCH',
        entity: { kind: 'node', id: node.id },
        message: `连接器 "${connector.name}" 的 pinCount (${connector.pinCount}) 与 pinLabels 数量 (${connector.pinLabels.length}) 不一致`,
        suggestedAction: '修正连接器数据中的 pinLabels 或 pinCount',
      });
    }

    // Check catalog entry exists
    const catalogEntry = CONNECTORS.find((c) => c.id === connector.id);
    if (!catalogEntry) {
      issues.push({
        id: '',
        severity: 'warning',
        code: 'UNKNOWN_CATALOG_PART',
        entity: { kind: 'node', id: node.id },
        message: `连接器 "${connector.name}" (${connector.id}) 不在当前目录中`,
        suggestedAction: '更新连接器目录或更换为已知型号',
      });
    }
  }
}

function validateConnections(config: HarnessConfig, issues: ValidationIssue[]): void {
  if (config.connections.length === 0 && config.nodes.length > 0) {
    issues.push({
      id: '',
      severity: 'info',
      code: 'NO_CONNECTIONS',
      entity: { kind: 'project' },
      message: '有连接器节点但没有线缆连接',
      suggestedAction: '在节点之间创建连接以定义线缆束',
    });
  }

  for (const conn of config.connections) {
    // Check from node exists
    if (!config.nodes.find((n) => n.id === conn.fromNodeId)) {
      issues.push({
        id: '',
        severity: 'error',
        code: 'DANGLING_CONNECTION_SOURCE',
        entity: { kind: 'connection', id: conn.id },
        message: `连接 "${conn.name}" 的起点节点 (${conn.fromNodeId}) 不存在`,
        suggestedAction: '删除此连接或修正起点节点引用',
      });
    }

    // Check to node exists
    if (!config.nodes.find((n) => n.id === conn.toNodeId)) {
      issues.push({
        id: '',
        severity: 'error',
        code: 'DANGLING_CONNECTION_TARGET',
        entity: { kind: 'connection', id: conn.id },
        message: `连接 "${conn.name}" 的终点节点 (${conn.toNodeId}) 不存在`,
        suggestedAction: '删除此连接或修正终点节点引用',
      });
    }

    // Check connection references itself
    if (conn.fromNodeId === conn.toNodeId) {
      issues.push({
        id: '',
        severity: 'error',
        code: 'SELF_REFERENCING_CONNECTION',
        entity: { kind: 'connection', id: conn.id },
        message: `连接 "${conn.name}" 的起点和终点相同 (${conn.fromNodeId})`,
        suggestedAction: '连接必须连接两个不同的节点',
      });
    }

    // Check empty connection
    if (conn.wireIds.length === 0) {
      issues.push({
        id: '',
        severity: 'warning',
        code: 'EMPTY_CONNECTION',
        entity: { kind: 'connection', id: conn.id },
        message: `连接 "${conn.name}" 没有包含导线`,
        suggestedAction: '向此连接添加导线或删除空连接',
      });
    }

    // Check wire IDs reference existing wires
    for (const wireId of conn.wireIds) {
      if (!config.wires.find((w) => w.id === wireId)) {
        issues.push({
          id: '',
          severity: 'error',
          code: 'DANGLING_WIRE_REFERENCE',
          entity: { kind: 'connection', id: conn.id },
          message: `连接 "${conn.name}" 引用了不存在的导线 (${wireId})`,
          suggestedAction: '从连接中移除此导线引用或恢复导线',
        });
      }
    }
  }
}

function validateWires(config: HarnessConfig, issues: ValidationIssue[]): void {
  if (config.wires.length === 0 && config.nodes.length > 0) {
    issues.push({
      id: '',
      severity: 'info',
      code: 'NO_WIRES',
      entity: { kind: 'project' },
      message: '有线缆连接但没有定义导线',
      suggestedAction: '向连接添加导线以定义引脚映射',
    });
  }

  const wireIdsInConnections = new Set(
    config.connections.flatMap((c) => c.wireIds)
  );

  for (const wire of config.wires) {
    // Check from connector exists
    const fromNode = config.nodes.find((n) => n.id === wire.fromConnectorId);
    if (!fromNode) {
      issues.push({
        id: '',
        severity: 'error',
        code: 'DANGLING_WIRE_SOURCE',
        entity: { kind: 'wire', id: wire.id },
        message: `导线 "${wire.name}" 的起点连接器 (${wire.fromConnectorId}) 不存在`,
        suggestedAction: '删除此导线或修正起点连接器引用',
      });
    }

    // Check to connector exists
    const toNode = config.nodes.find((n) => n.id === wire.toConnectorId);
    if (!toNode) {
      issues.push({
        id: '',
        severity: 'error',
        code: 'DANGLING_WIRE_TARGET',
        entity: { kind: 'wire', id: wire.id },
        message: `导线 "${wire.name}" 的终点连接器 (${wire.toConnectorId}) 不存在`,
        suggestedAction: '删除此导线或修正终点连接器引用',
      });
    }

    // Check from pin range
    if (fromNode?.connector && (wire.fromPin < 1 || wire.fromPin > fromNode.connector.pinCount)) {
      issues.push({
        id: '',
        severity: 'error',
        code: 'PIN_OUT_OF_RANGE',
        entity: { kind: 'wire', id: wire.id },
        message: `导线 "${wire.name}" 的起点PIN (${wire.fromPin}) 超出连接器 "${fromNode.label}" 的范围 (1-${fromNode.connector.pinCount})`,
        suggestedAction: '修正起点PIN或更换连接器',
      });
    }

    // Check to pin range
    if (toNode?.connector && (wire.toPin < 1 || wire.toPin > toNode.connector.pinCount)) {
      issues.push({
        id: '',
        severity: 'error',
        code: 'PIN_OUT_OF_RANGE',
        entity: { kind: 'wire', id: wire.id },
        message: `导线 "${wire.name}" 的终点PIN (${wire.toPin}) 超出连接器 "${toNode.label}" 的范围 (1-${toNode.connector.pinCount})`,
        suggestedAction: '修正终点PIN或更换连接器',
      });
    }

    // Check wire belongs to a connection
    if (!wireIdsInConnections.has(wire.id)) {
      issues.push({
        id: '',
        severity: 'warning',
        code: 'ORPHAN_WIRE',
        entity: { kind: 'wire', id: wire.id },
        message: `导线 "${wire.name}" 不属于任何连接（孤立导线）`,
        suggestedAction: '将此导线添加到连接中或将其删除',
      });
    }

    // Check negative or zero length
    if (wire.lengthMm <= 0) {
      issues.push({
        id: '',
        severity: 'error',
        code: 'INVALID_LENGTH',
        entity: { kind: 'wire', id: wire.id },
        message: `导线 "${wire.name}" 的长度无效 (${wire.lengthMm}mm)`,
        suggestedAction: '设置正数长度值',
      });
    }

    // Check large length
    if (wire.lengthMm > 50000) {
      issues.push({
        id: '',
        severity: 'warning',
        code: 'LARGE_LENGTH',
        entity: { kind: 'wire', id: wire.id },
        message: `导线 "${wire.name}" 的长度异常大 (${wire.lengthMm}mm = ${(wire.lengthMm / 1000).toFixed(1)}m)`,
        suggestedAction: '确认长度是否正确',
      });
    }

    // Check wire endpoint consistency with parent connection
    const parentConn = config.connections.find((c) => c.wireIds.includes(wire.id));
    if (parentConn) {
      if (wire.fromConnectorId !== parentConn.fromNodeId && wire.fromConnectorId !== parentConn.toNodeId) {
        issues.push({
          id: '',
          severity: 'error',
          code: 'WIRE_CONNECTION_MISMATCH',
          entity: { kind: 'wire', id: wire.id },
          message: `导线 "${wire.name}" 的起点 (${wire.fromConnectorId}) 不属于其父连接 "${parentConn.name}"`,
          suggestedAction: '修正导线端点以匹配连接或移动导线到正确的连接',
        });
      }
      if (wire.toConnectorId !== parentConn.fromNodeId && wire.toConnectorId !== parentConn.toNodeId) {
        issues.push({
          id: '',
          severity: 'error',
          code: 'WIRE_CONNECTION_MISMATCH',
          entity: { kind: 'wire', id: wire.id },
          message: `导线 "${wire.name}" 的终点 (${wire.toConnectorId}) 不属于其父连接 "${parentConn.name}"`,
          suggestedAction: '修正导线端点以匹配连接或移动导线到正确的连接',
        });
      }
    }
  }
}

function validateCrossReferences(config: HarnessConfig, issues: ValidationIssue[]): void {
  // Check for duplicate node positions
  const posMap = new Map<string, string[]>();
  for (const node of config.nodes) {
    const key = `${node.position.x},${node.position.y}`;
    const ids = posMap.get(key) || [];
    ids.push(node.id);
    posMap.set(key, ids);
  }
  for (const [, ids] of posMap) {
    if (ids.length > 1) {
      issues.push({
        id: '',
        severity: 'info',
        code: 'OVERLAPPING_NODES',
        entity: { kind: 'node', id: ids[0] },
        message: `${ids.length} 个节点位置重叠`,
        suggestedAction: '移动节点以避免视觉重叠',
      });
    }
  }
}

function validateCatalogConsistency(config: HarnessConfig, issues: ValidationIssue[]): void {
  // Check for quantity
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

  // Check wire color references
  for (const wire of config.wires) {
    if (!['red', 'black', 'white', 'green', 'blue', 'yellow', 'orange', 'purple', 'brown', 'gray', 'pink'].includes(wire.wireColor)) {
      issues.push({
        id: '',
        severity: 'warning',
        code: 'UNKNOWN_WIRE_COLOR',
        entity: { kind: 'wire', id: wire.id },
        message: `导线 "${wire.name}" 的颜色 "${wire.wireColor}" 不在已知颜色列表中`,
        suggestedAction: '选择标准颜色',
      });
    }
  }

  // Check wire type references
  const knownWireTypes = ['silicone', 'ul1007', 'ul1061', 'gxl', 'ptfe'];
  for (const wire of config.wires) {
    if (!knownWireTypes.includes(wire.wireType)) {
      issues.push({
        id: '',
        severity: 'warning',
        code: 'UNKNOWN_WIRE_TYPE',
        entity: { kind: 'wire', id: wire.id },
        message: `导线 "${wire.name}" 的类型 "${wire.wireType}" 不在已知类型列表中`,
        suggestedAction: '选择标准线材类型',
      });
    }
  }

  // Check wire gauge references
  const knownGauges = [22, 24, 26, 28, 30];
  for (const wire of config.wires) {
    if (!knownGauges.includes(wire.wireGauge)) {
      issues.push({
        id: '',
        severity: 'warning',
        code: 'UNKNOWN_WIRE_GAUGE',
        entity: { kind: 'wire', id: wire.id },
        message: `导线 "${wire.name}" 的线规 ${wire.wireGauge}AWG 不在已知列表中`,
        suggestedAction: '选择标准线规',
      });
    }
  }
}
