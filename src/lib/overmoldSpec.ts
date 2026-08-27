import type {
  CanvasModel,
  OvermoldForm,
  OvermoldInnerMaterial,
  OvermoldSpec,
} from '@/types/harness';

/**
 * 格式化外模材质显示标签。
 * 例如：'黑色PVC' + '45P' -> '黑色PVC 45P'；'黑色TPE' -> '黑色TPE'
 */
export function formatOvermoldOuterLabel(spec?: { outerMaterial?: string; outerHardness?: string }): string {
  if (!spec || !spec.outerMaterial) return '';
  const mat = spec.outerMaterial.trim();
  const hardness = spec.outerHardness?.trim();
  if (hardness && !mat.includes(hardness)) {
    return `${mat} ${hardness}`;
  }
  return mat;
}

/**
 * 格式化外型文案：straight -> 直头，bent -> 弯头。
 */
export function formatOvermoldForm(form?: OvermoldForm | string): string {
  if (!form) return '';
  if (form === 'straight' || form === '直头') return '直头';
  if (form === 'bent' || form === '弯头') return '弯头';
  return form;
}

/**
 * 组合外模完整规格描述：外模材质 + 外型。
 * 例如：'黑色PVC 45P · 直头'
 */
export function formatOvermoldFullSpec(spec: OvermoldSpec): string {
  const outerLabel = formatOvermoldOuterLabel(spec);
  const formLabel = formatOvermoldForm(spec.outerForm);
  if (outerLabel && formLabel) {
    return `${outerLabel} · ${formLabel}`;
  }
  return outerLabel || formLabel;
}

export interface AvailableInnerMold {
  material: OvermoldInnerMaterial;
  form: OvermoldForm;
  formLabel: string;
}

/**
 * 提取规格中可用的内模元数据。
 * 当且仅当规格声明了完整且与外模一致的内模元数据时返回只读配置。
 */
export function getAvailableInnerMold(spec?: OvermoldSpec | null): AvailableInnerMold | null {
  if (!spec?.innerMaterial || !spec.innerForm || spec.innerForm !== spec.outerForm) {
    return null;
  }
  return {
    material: spec.innerMaterial,
    form: spec.innerForm,
    formLabel: formatOvermoldForm(spec.innerForm),
  };
}

export interface OvermoldBomEntry {
  kind: 'outer' | 'inner';
  specification: string;
  quantity: number;
}

/** Builds the exact overmold rows shared by BOM rendering and layout sizing. */
export function buildOvermoldBomEntries(
  models: readonly CanvasModel[],
  overmolds: readonly OvermoldSpec[],
): OvermoldBomEntry[] {
  const specsById = new Map(overmolds.map((spec) => [spec.id, spec]));
  const outerCounts = new Map<string, OvermoldBomEntry>();
  const innerCounts = new Map<string, OvermoldBomEntry>();

  for (const model of models) {
    const spec = specsById.get(model.overmoldSpecId);
    const outerSpecification = spec ? formatOvermoldFullSpec(spec) : model.overmoldSpecId;
    const outerEntry = outerCounts.get(model.overmoldSpecId);
    if (outerEntry) {
      outerEntry.quantity += 1;
    } else {
      outerCounts.set(model.overmoldSpecId, {
        kind: 'outer',
        specification: outerSpecification,
        quantity: 1,
      });
    }

    if (!model.includeInnerMold || !spec) continue;
    const innerMold = getAvailableInnerMold(spec);
    if (!innerMold) continue;
    const innerSpecification = `${innerMold.material} · ${innerMold.formLabel}`;
    const innerEntry = innerCounts.get(innerSpecification);
    if (innerEntry) {
      innerEntry.quantity += 1;
    } else {
      innerCounts.set(innerSpecification, {
        kind: 'inner',
        specification: innerSpecification,
        quantity: 1,
      });
    }
  }

  return [...outerCounts.values(), ...innerCounts.values()];
}
