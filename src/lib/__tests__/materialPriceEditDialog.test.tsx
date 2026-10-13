import { isValidElement, type ReactNode, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MaterialPriceEditDialog } from '@/components/materials/MaterialPriceEditDialog';
import type { QuoteMaterial } from '@/lib/quoteMaterials';
const harness = vi.hoisted(() => ({ index: 0, states: [] as unknown[], role: 'engineer', save: vi.fn() }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return { ...actual, useEffect: vi.fn(),
    useState: (initial: unknown) => {
      const i = harness.index++;
      if (!(i in harness.states)) harness.states[i] = typeof initial === 'function' ? initial() : initial;
      return [harness.states[i], (value: unknown) => { harness.states[i] = value; }];
    },
    useRef: (value: unknown) => {
      const i = harness.index++;
      if (!(i in harness.states)) harness.states[i] = { current: value };
      return harness.states[i];
    },
  };
});
vi.mock('@/stores/userStore', () => ({ useUserStore: (selector: (s: unknown) => unknown) => selector({ currentUser: { role: harness.role } }) }));
vi.mock('@/stores/priceStore', () => ({ usePriceStore: { getState: () => ({ saveEdits: harness.save }) } }));
type Props = { children?: ReactNode; value?: string; disabled?: boolean; onChange?: (e: { target: { value: string } }) => void;
  onClick?: () => void; onSubmit?: (e: { preventDefault: () => void }) => void; role?: string };
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
const candidate: QuoteMaterial = { kind: 'connector', resourceId: 'c', name: '连接器', specification: '["M12","M12",4,"male"]', lengthMm: 0, unit: '元/个', quantity: 1 };
const close = vi.fn();
function render(candidates = [candidate]) {
  harness.index = 0;
  return elements(MaterialPriceEditDialog({ candidates, prices: [{ ...candidate, taxIncludedPrice: '1.123456', updatedAt: '2026-10-12T00:00:00Z' }], onClose: close }));
}
function submit(tree: ReactElement<Props>[]) { tree.find(e => e.type === 'form')!.props.onSubmit!({ preventDefault() {} }); }
describe('material price dialog handlers', () => {
  beforeEach(() => { harness.states = []; harness.index = 0; harness.role = 'engineer'; harness.save.mockReset(); close.mockReset(); });
  it('preserves precision, submits changed price once and closes only after save', async () => {
    let resolve!: () => void;
    harness.save.mockImplementation(() => new Promise<void>(r => { resolve = r; }));
    let tree = render();
    const input = tree.find(e => e.type === 'input')!;
    expect(input.props.value).toBe('1.123456');
    input.props.onChange!({ target: { value: '0' } });
    tree = render(); submit(tree); submit(tree);
    expect(harness.save).toHaveBeenCalledOnce();
    expect(harness.save).toHaveBeenCalledWith([expect.objectContaining({ taxIncludedPrice: '0', expectedUpdatedAt: '2026-10-12T00:00:00Z' })]);
    expect(close).not.toHaveBeenCalled();
    expect(render().filter(e => e.type === 'button').every(e => e.props.disabled)).toBe(true);
    resolve(); await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
  it('retains input and shows an error after failure', async () => {
    harness.save.mockRejectedValue(new Error('offline'));
    render().find(e => e.type === 'input')!.props.onChange!({ target: { value: '2' } });
    submit(render());
    await vi.waitFor(() => expect(render().some(e => e.props.role === 'alert')).toBe(true));
    expect(render().find(e => e.type === 'input')!.props.value).toBe('2');
    expect(close).not.toHaveBeenCalled();
  });
  it('adds a wire length tier and submits per-strip pricing', async () => {
    const wire: QuoteMaterial = { ...candidate, kind: 'wire', specification: '["electronic",24,"黑色","1007"]', unit: '元/条', lengthMm: 1000 };
    render([wire]).find(e => e.type === 'button' && e.props.children === '新增长度档位')!.props.onClick!();
    let inputs = render([wire]).filter(e => e.type === 'input');
    expect(inputs).toHaveLength(4);
    inputs[2].props.onChange!({ target: { value: '2000' } });
    inputs = render([wire]).filter(e => e.type === 'input');
    inputs[3].props.onChange!({ target: { value: '3.123456' } });
    harness.save.mockResolvedValue(undefined);
    submit(render([wire]));
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(harness.save).toHaveBeenCalledWith([expect.objectContaining({ kind: 'wire', lengthMm: 2000, unit: '元/条', taxIncludedPrice: '3.123456', expectedUpdatedAt: null })]);
  });
  it('provides separate fields for outer and inner molds', () => {
    const mold: QuoteMaterial = { ...candidate, kind: 'outer-mold', specification: '["黑色PVC","45P","straight"]' };
    const tree = render([mold, { ...mold, kind: 'inner-mold', specification: '["低密度透明PE","straight"]' }]);
    expect(tree.filter(e => e.type === 'input')).toHaveLength(2);
    expect(tree.some(e => e.props.children === '外模')).toBe(true);
    expect(tree.some(e => e.props.children === '内模')).toBe(true);
  });
  it('hides editor from sales', () => { harness.role = 'sales'; expect(render()).toEqual([]); });
});
