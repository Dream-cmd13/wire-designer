// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectWizard } from '@/components/project/ProjectWizard';
import { projectRepository } from '@/repositories/projectRepository';
import { useUserStore } from '@/stores/userStore';
import { useProjectStore } from '@/stores/projectStore';
import { useHarnessStore } from '@/stores/harnessStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { setCatalogSnapshot } from '@/lib/catalogRuntime';
import { DocumentWriteError } from '@/lib/documentWriteError';
import {
  getConnectorHeight,
  getConnectorNodeWidth,
  getMaterialNodeHeight,
} from '@/lib/canvasMaterials';
import { validateHarness } from '@/lib/validation';
import { generateBOM } from '@/lib/bom';
import type { CatalogSnapshot, CatalogWire } from '@/types/catalog';
import type { Connector, HarnessConfig } from '@/types/harness';

const version = { revision: 1, updatedAt: '2026-01-01T00:00:00.000Z' };

function deferredCreate() {
  let resolve!: (value: typeof version) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<typeof version>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderCreateStep(onComplete = vi.fn(), onCancel = vi.fn()) {
  render(<ProjectWizard onComplete={onComplete} onCancel={onCancel} />);
  fireEvent.change(screen.getByPlaceholderText('如：无人机电源线束'), { target: { value: '测试项目' } });
  for (let step = 1; step <= 3; step += 1) fireEvent.click(screen.getByRole('button', { name: '下一步' }));
  return screen.getByRole('button', { name: '创建项目' });
}

function signIn(id: string | null): void {
  useUserStore.setState({
    currentUser: id ? { id, name: id, email: `${id}@test`, createdAt: 1 } : null,
    authReady: true,
  });
}

describe('project wizard creation', () => {
  beforeEach(() => {
    vi.spyOn(useCatalogStore.getState(), 'initialize').mockResolvedValue(undefined);
    useProjectStore.getState().resetProjects();
    signIn('user-old');
  });
  afterEach(() => {
    cleanup();
    useCatalogStore.getState().reset();
    vi.restoreAllMocks();
  });

  it.each(['user-new', null, 'user-old'])('does not replace the workspace after resetting the session to %s', async (nextUser) => {
    const pendingCreate = deferredCreate();
    vi.spyOn(projectRepository, 'createProject').mockReturnValue(pendingCreate.promise);
    const replaceDocument = vi.spyOn(useHarnessStore.getState(), 'replaceDocument');
    const onComplete = vi.fn();
    fireEvent.click(renderCreateStep(onComplete));
    expect(projectRepository.createProject).toHaveBeenCalledOnce();

    await act(async () => {
      signIn(nextUser);
      useProjectStore.getState().resetProjects();
      pendingCreate.resolve(version);
    });

    expect(replaceDocument).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(useProjectStore.getState().currentProject).toBeNull();
  });

  it('opens the created document and completes while the account is unchanged', async () => {
    vi.spyOn(projectRepository, 'createProject').mockResolvedValue(version);
    const replaceDocument = vi.spyOn(useHarnessStore.getState(), 'replaceDocument').mockImplementation(() => {});
    const onComplete = vi.fn();
    fireEvent.click(renderCreateStep(onComplete));
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(replaceDocument).toHaveBeenCalledOnce();
    expect(replaceDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: useProjectStore.getState().currentProject?.id }),
      { markSaved: true },
    );
  });

  it('offers to refresh the project list when the creation outcome is unknown', async () => {
    const create = vi.spyOn(projectRepository, 'createProject');
    const pendingCreate = deferredCreate();
    create.mockReturnValue(pendingCreate.promise);
    const listProjects = vi.spyOn(projectRepository, 'listProjects').mockResolvedValue([]);
    const onCancel = vi.fn();
    fireEvent.click(renderCreateStep(vi.fn(), onCancel));
    const failure = new DocumentWriteError('network', 'Network disconnected');
    await act(async () => {
      pendingCreate.reject(failure);
    });

    expect(await screen.findByText(/请先返回项目列表/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '创建项目' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '返回项目列表' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(listProjects).toHaveBeenCalledExactlyOnceWith('user-old');
    expect(create).toHaveBeenCalledOnce();
  });
});

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y
  );
}

function makeTestConnector(id: string, name: string, pinCount: number, type: 'male' | 'female'): Connector {
  return {
    id,
    name,
    supplierNo: 'SUP-01',
    pinCount,
    type,
    pinLabels: Array.from({ length: pinCount }, (_, i) => String(i + 1)),
  };
}

const TEST_WIRES: CatalogWire[] = [
  {
    id: 'wire-red',
    resourceItemId: 'res-wire-red',
    name: 'UL1007 26AWG 红色',
    spec: { kind: 'electronic', color: 'red', awg: 26, ulNumber: '1007' },
  },
  {
    id: 'wire-black',
    resourceItemId: 'res-wire-black',
    name: 'UL1007 26AWG 黑色',
    spec: { kind: 'electronic', color: 'black', awg: 26, ulNumber: '1007' },
  },
];

const WIZARD_TEST_CATALOG: CatalogSnapshot = {
  connectors: [
    makeTestConnector('conn-4p-male', 'M12 4芯公头', 4, 'male'),
    makeTestConnector('conn-5p-female', 'M12 5芯母头', 5, 'female'),
    makeTestConnector('conn-4p-female', 'M12 4芯母头', 4, 'female'),
    makeTestConnector('conn-2p-female', 'M12 2芯母头', 2, 'female'),
  ],
  wires: TEST_WIRES,
  wireColors: [],
  overmolds: [],
  leadTimeOptions: [],
  protectionOptions: [],
  pricingRules: [],
  quantityDiscountRules: [],
  loadedAt: 1,
};

function assertValidNoOverlapLayout(config: HarnessConfig) {
  const connRects: Rect[] = config.connectors.map((c) => ({
    x: c.position.x,
    y: c.position.y,
    width: getConnectorNodeWidth(c),
    height: getConnectorHeight(c),
  }));

  for (let i = 0; i < connRects.length; i += 1) {
    for (let j = i + 1; j < connRects.length; j += 1) {
      expect(rectsOverlap(connRects[i], connRects[j])).toBe(false);
    }
  }

  const wireRects: Rect[] = config.materials.map((m) => ({
    x: m.position.x,
    y: m.position.y,
    width: m.width,
    height: getMaterialNodeHeight('electronic'),
  }));

  for (let i = 0; i < wireRects.length; i += 1) {
    for (const cRect of connRects) {
      expect(rectsOverlap(wireRects[i], cRect)).toBe(false);
    }
    for (let j = i + 1; j < wireRects.length; j += 1) {
      expect(rectsOverlap(wireRects[i], wireRects[j])).toBe(false);
    }
  }

  // Merged details panel rendered below the bottom-most wire in the connected group
  if (config.materials.length > 0) {
    const bottomWire = [...config.materials].sort((a, b) => b.position.y - a.position.y || b.position.x - a.position.x)[0];
    const materialDescriptions = config.materials.map((m) =>
      m.spec.kind === 'electronic'
        ? `UL${m.spec.ulNumber} · ${m.spec.awg}AWG · ${m.spec.lengthMm}mm`
        : '',
    );
    const longestMat = Math.max(2, ...materialDescriptions.map((d) => d.length));
    const materialColWidth = Math.min(280, Math.max(110, Math.round(longestMat * 6.4)));
    const longestSig = Math.max(4, ...config.materials.map((m) => m.circuits[0]?.signalName.length ?? 0));
    const sigColWidth = Math.min(180, Math.max(56, Math.round(longestSig * 7.2)));
    const panelWidth = Math.max(300, materialColWidth + config.connectors.length * 80 + sigColWidth + 60);
    const panelCenterX = bottomWire.position.x + bottomWire.width / 2;
    const panelRect: Rect = {
      x: panelCenterX - panelWidth / 2,
      y: bottomWire.position.y + getMaterialNodeHeight('electronic') + 44,
      width: panelWidth,
      height: 60 + config.materials.length * 24,
    };

    for (const cRect of connRects) {
      expect(rectsOverlap(panelRect, cRect)).toBe(false);
    }
  }
}

async function createTemplateViaWizard(params: {
  projectName: string;
  templateName: '简单双端线束' | 'T型分支线束' | '星型四端线束';
  primaryLabel: string;
  secondaryLabel: string;
  pinLabelPattern: RegExp;
  connectorAId: string;
  connectorBId: string;
  pinCount: number;
}): Promise<HarnessConfig> {
  setCatalogSnapshot(WIZARD_TEST_CATALOG);
  useCatalogStore.setState({ snapshot: WIZARD_TEST_CATALOG, status: 'ready', error: null });

  vi.spyOn(projectRepository, 'createProject').mockResolvedValue(version);
  const replaceDocument = vi.spyOn(useHarnessStore.getState(), 'replaceDocument').mockImplementation(() => {});
  const onComplete = vi.fn();

  render(<ProjectWizard onComplete={onComplete} onCancel={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText('如：无人机电源线束'), { target: { value: params.projectName } });
  fireEvent.click(screen.getByRole('button', { name: '下一步' }));

  fireEvent.click(screen.getByText(params.templateName));
  fireEvent.click(screen.getByRole('button', { name: '下一步' }));

  fireEvent.change(screen.getByLabelText(params.primaryLabel), { target: { value: params.connectorAId } });
  fireEvent.change(screen.getByLabelText(params.secondaryLabel), { target: { value: params.connectorBId } });
  fireEvent.change(screen.getByLabelText(params.pinLabelPattern), { target: { value: String(params.pinCount) } });
  fireEvent.click(screen.getByRole('button', { name: '下一步' }));

  fireEvent.click(screen.getByRole('button', { name: '创建项目' }));
  await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());

  return replaceDocument.mock.calls[0][0] as HarnessConfig;
}

describe('project wizard templates and UI flow', () => {
  beforeEach(() => {
    vi.spyOn(useCatalogStore.getState(), 'initialize').mockResolvedValue(undefined);
    useProjectStore.getState().resetProjects();
    signIn('user-old');
  });

  afterEach(() => {
    cleanup();
    useCatalogStore.getState().reset();
    vi.restoreAllMocks();
  });

  it('builds simple-2p with 1 electronic wire per circuit, valid BOM, and zero overlap', async () => {
    const config = await createTemplateViaWizard({
      projectName: '双端测试',
      templateName: '简单双端线束',
      primaryLabel: '起始连接器',
      secondaryLabel: '目标连接器',
      pinLabelPattern: /接线数量 \/ PIN数:/,
      connectorAId: 'conn-4p-male',
      connectorBId: 'conn-4p-female',
      pinCount: 3,
    });

    expect(config.connectors.map((c) => c.label)).toEqual(['P1', 'P2']);
    expect(config.materials).toHaveLength(3);
    config.materials.forEach((m, idx) => {
      expect(m.spec.kind).toBe('electronic');
      expect(m.circuits).toHaveLength(1);
      expect(m.spec.kind === 'electronic' && m.spec.color).toBe(m.circuits[0].color);
      expect(m.circuits[0].start?.pin).toBe(idx + 1);
      expect(m.circuits[0].end?.pin).toBe(idx + 1);
      expect(m.circuits[0].signalName).toBe(`SIG${idx + 1}`);
    });
    expect(config.materials[0].resourceItemId).toBe('res-wire-red');
    expect(config.materials[1].resourceItemId).toBe('res-wire-black');
    expect(config.materials[2].resourceItemId).toBeUndefined();

    const errors = validateHarness(config, WIZARD_TEST_CATALOG).filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);

    const bomWireTotal = generateBOM(config)
      .filter((item) => item.type === 'wire')
      .reduce((sum, item) => sum + item.quantity, 0);
    expect(bomWireTotal).toBe(3);

    assertValidNoOverlapLayout(config);
  });

  it('builds t-branch with consistent branch circuits, pin count, and zero overlap', async () => {
    const config = await createTemplateViaWizard({
      projectName: 'T型测试',
      templateName: 'T型分支线束',
      primaryLabel: '主端连接器',
      secondaryLabel: '分支连接器（2 端）',
      pinLabelPattern: /每路分支接线数:/,
      connectorAId: 'conn-4p-male',
      connectorBId: 'conn-4p-female',
      pinCount: 3,
    });

    expect(config.connectors.map((c) => c.label)).toEqual(['P1', 'P2', 'P3']);
    expect(config.materials).toHaveLength(6);
    for (const m of config.materials) {
      expect(m.circuits).toHaveLength(1);
      expect(m.spec.kind === 'electronic' && m.spec.color).toBe(m.circuits[0].color);
    }

    const errors = validateHarness(config, WIZARD_TEST_CATALOG).filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);

    const bomWireTotal = generateBOM(config)
      .filter((item) => item.type === 'wire')
      .reduce((sum, item) => sum + item.quantity, 0);
    expect(bomWireTotal).toBe(6);

    assertValidNoOverlapLayout(config);
  });

  it('builds star-4 as left-to-right P1..P5 fan-out with dedicated center pins when sufficient', async () => {
    const config = await createTemplateViaWizard({
      projectName: '星型独立引脚测试',
      templateName: '星型四端线束',
      primaryLabel: '中心主连接器',
      secondaryLabel: '外围分支连接器（4 端）',
      pinLabelPattern: /每路分支接线数:/,
      connectorAId: 'conn-4p-male',
      connectorBId: 'conn-4p-female',
      pinCount: 1,
    });

    expect(config.connectors.map((c) => c.label)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5']);
    const [center, ...arms] = config.connectors;
    for (const arm of arms) {
      expect(arm.position.x).toBeGreaterThan(center.position.x + getConnectorNodeWidth(center));
    }

    expect(config.materials).toHaveLength(4);
    expect(config.materials.map((m) => m.circuits[0].start?.pin)).toEqual([1, 2, 3, 4]);
    expect(config.materials.map((m) => m.circuits[0].signalName)).toEqual(['SIG1', 'SIG2', 'SIG3', 'SIG4']);
    expect(config.materials.map((m) => m.circuits[0].end?.pin)).toEqual([1, 1, 1, 1]);

    const errors = validateHarness(config, WIZARD_TEST_CATALOG).filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
    assertValidNoOverlapLayout(config);
  });

  it('builds star-4 with shared bus pins when center pins < 4 * branch pins', async () => {
    const config = await createTemplateViaWizard({
      projectName: '星型并接测试',
      templateName: '星型四端线束',
      primaryLabel: '中心主连接器',
      secondaryLabel: '外围分支连接器（4 端）',
      pinLabelPattern: /每路分支接线数:/,
      connectorAId: 'conn-4p-male',
      connectorBId: 'conn-4p-female',
      pinCount: 2,
    });

    expect(config.materials).toHaveLength(8);
    expect(config.materials.map((m) => m.circuits[0].start?.pin)).toEqual([1, 2, 1, 2, 1, 2, 1, 2]);
    expect(config.materials.map((m) => m.circuits[0].signalName)).toEqual([
      'SIG1', 'SIG2', 'SIG1', 'SIG2', 'SIG1', 'SIG2', 'SIG1', 'SIG2',
    ]);

    const errors = validateHarness(config, WIZARD_TEST_CATALOG).filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
    assertValidNoOverlapLayout(config);
  });

  it('pairs matching pin counts by default and shows connector names on Step 4 without touching dropdowns', async () => {
    setCatalogSnapshot(WIZARD_TEST_CATALOG);
    useCatalogStore.setState({ snapshot: WIZARD_TEST_CATALOG, status: 'ready', error: null });

    vi.spyOn(projectRepository, 'createProject').mockResolvedValue(version);
    const replaceDocument = vi.spyOn(useHarnessStore.getState(), 'replaceDocument').mockImplementation(() => {});
    const onComplete = vi.fn();

    render(<ProjectWizard onComplete={onComplete} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('如：无人机电源线束'), { target: { value: '星型向导项目' } });
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    fireEvent.click(screen.getByText('星型四端线束'));
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    const primarySelect = screen.getByLabelText('中心主连接器') as HTMLSelectElement;
    const secondarySelect = screen.getByLabelText('外围分支连接器（4 端）') as HTMLSelectElement;
    expect(primarySelect.value).toBe('conn-4p-male');
    expect(secondarySelect.value).toBe('conn-4p-female');

    // Increase pins to 4, then switch secondary connector to 2P and verify clamping
    const slider = screen.getByLabelText(/每路分支接线数:/) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '4' } });
    expect(screen.getByText('每路分支接线数: 4（共 16 条电子线）')).toBeTruthy();

    fireEvent.change(secondarySelect, { target: { value: 'conn-2p-female' } });
    expect(screen.getByText('每路分支接线数: 2（共 8 条电子线）')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByText('M12 4芯公头 (4P)')).toBeTruthy();
    expect(screen.getByText('M12 2芯母头 (2P)')).toBeTruthy();
    expect(screen.getByText('每路 2 条（共 8 条电子线）')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '创建项目' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(replaceDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        materials: expect.arrayContaining([expect.objectContaining({ spec: expect.objectContaining({ kind: 'electronic' }) })]),
      }),
      { markSaved: true },
    );
    const createdConfig = replaceDocument.mock.calls[0][0] as HarnessConfig;
    expect(createdConfig.materials).toHaveLength(8);
  });

  it('displays default connector names on Step 4 for t-branch without changing Step 3 selections', () => {
    setCatalogSnapshot(WIZARD_TEST_CATALOG);
    useCatalogStore.setState({ snapshot: WIZARD_TEST_CATALOG, status: 'ready', error: null });

    render(<ProjectWizard onComplete={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('如：无人机电源线束'), { target: { value: 'T型默认项目' } });
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    fireEvent.click(screen.getByText('T型分支线束'));
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByLabelText('主端连接器')).toBeTruthy();
    expect(screen.getByLabelText('分支连接器（2 端）')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByText('M12 4芯公头 (4P)')).toBeTruthy();
    expect(screen.getByText('M12 4芯母头 (4P)')).toBeTruthy();
    expect(screen.getByText('每路 2 条（共 4 条电子线）')).toBeTruthy();
  });
});
