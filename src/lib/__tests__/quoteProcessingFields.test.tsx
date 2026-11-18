// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { QuoteProcessingFields } from '@/components/autoQuote/QuoteProcessingFields';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';
import { parseHarnessConfig } from '@/lib/harnessConfigSchema';
import { calculatePrice } from '../../../server/pricing';
import { getQuoteMaterials } from '@/lib/quoteMaterials';
import type { HarnessConfig } from '@/types/harness';
import type { CatalogSnapshot } from '@/types/catalog';

afterEach(cleanup);

function Harness() {
  const [config, setConfig] = useState<HarnessConfig>(() => ({
    ...createFallbackConfig(),
    quotation: { processingEnds: 1, srPoints: 0 },
    connectors: [{ id: 'a', label: 'A', position: { x: 0, y: 0 }, jumpers: [],
      connector: { id: 'c', resourceItemId: 'c', name: 'M12', pinCount: 5, shielded: false, type: 'male', pinLabels: ['1', '2', '3', '4', '5'] } }],
    materials: [{ id: 'w', name: '六芯屏蔽线', resourceItemId: 'w', position: { x: 0, y: 0 }, width: 100, circuits: [],
      spec: { kind: 'jacketed', coreCount: 6, shielded: true, jacketMaterial: 'PVC', jacketColor: 'black', odMm: 5,
        coreColors: ['红色', '黑色', '白色', '蓝色', '绿色', '黄色'], awg: 24, lengthMm: 500,
        endTreatment: { start: { stripped: false, termination: 'none' }, end: { stripped: false, termination: 'none' } } } }],
    models: [{ id: 'm', kind: 'outer-box', overmoldSpecId: 'm', includeInnerMold: false, position: { x: 0, y: 0 }, width: 30, height: 30 }],
  }));
  const catalog = { overmolds: [{ id: 'm', resourceItemId: 'm', name: '外模', outerMaterial: '黑色PVC', outerHardness: '45P', outerForm: 'straight' }] } as CatalogSnapshot;
  const saved = parseHarnessConfig(JSON.parse(JSON.stringify(config)));
  const prices = getQuoteMaterials(config, catalog).map(row => ({ ...row, taxIncludedPrice: '2' }));
  const result = saved.success ? calculatePrice(saved.data, prices, catalog) : null;
  return <>
    <QuoteProcessingFields config={config} onChange={counts => setConfig(current => ({
      ...current, quotation: { ...current.quotation!, ...counts },
    }))} />
    <output aria-label="配置校验">{saved.success ? '有效' : saved.issues.join(', ')}</output>
    <output aria-label="压端子记录">{saved.success ? saved.data.quotation?.crimpingPoints ?? 0 : ''}</output>
    <output aria-label="报价结果">{result?.status === 'ready'
      ? result.price.labor.find(row => row.name === '焊接')?.amount
      : '请填写有效加工点数'}</output>
  </>;
}

describe('actual processing counts', () => {
  it('quotes user-entered counts after saving and loading without assuming all six cores are welded', () => {
    render(<Harness />);
    expect(screen.getByLabelText('报价结果').textContent).toBe('请填写有效加工点数');
    fireEvent.change(screen.getByLabelText('实际焊接点数'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('芯线剥皮点数'), { target: { value: '5' } });
    expect(screen.getByLabelText('配置校验').textContent).toBe('有效');
    expect(screen.getByLabelText('报价结果').textContent).toBe('1');
    fireEvent.change(screen.getByLabelText('实际焊接点数'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('芯线剥皮点数'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('压端子次数（暂不计费）'), { target: { value: '1' } });
    expect(screen.getByLabelText('压端子记录').textContent).toBe('1');
    expect(screen.getByLabelText('报价结果').textContent).toBe('0.4');
    fireEvent.change(screen.getByLabelText('实际焊接点数'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('芯线剥皮点数'), { target: { value: '0' } });
    expect(screen.getByLabelText('报价结果').textContent).toBe('0');
    fireEvent.change(screen.getByLabelText('实际焊接点数'), { target: { value: '' } });
    expect(screen.getByLabelText('报价结果').textContent).toBe('请填写有效加工点数');
  });
});
