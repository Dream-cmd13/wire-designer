import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hitDwgEditSources, normalizeDwgEditText, readEditableDwgText, updateDwgOperations } from '@/lib/dwg/dwgEdit';
import { parseDwg, previewDwgOperations } from '@/lib/dwg/parseDwg';
import { worldToScreen } from '@/lib/dwg/dwgView';

describe('DWG limited editing', () => {
  it('reads uniform formatting and preserves visible spaces, paragraphs and escapes', () => {
    expect(normalizeDwgEditText('  500\r\n±10  ')).toBe('  500\n±10  ');
    expect(readEditableDwgText(String.raw`{\fSimSun|b0|i0|c134|p2;\H0.8x;  第一行 \P\{第二行\} \\ %%p10 }`, true))
      .toBe('  第一行 \n{第二行} \\ ±10 ');
    for (const raw of [String.raw`{\H2x;大}{\H1x;小}`, String.raw`\S1#2;`, '长度 <>', '%<field>%', '一%%u']) {
      expect(readEditableDwgText(raw, true)).toBeNull();
    }
  });

  it('maps the actual dimension line and text to their parent, keeps duplicate numbers, and reverts to the immutable source', async () => {
    const name = 'M12A05-07-068-3-10-500.dwg';
    const drawing = await parseDwg(Uint8Array.from(readFileSync(name)).buffer, { fileName: name });
    expect(drawing.version).toBe('AC1018');
    const parts = drawing.entities.filter((part) => part.editSource?.handle === '9F0');
    const label = parts.find((part) => part.kind === 'text')!;
    const line = parts.find((part) => part.kind === 'line')!;
    const source = label.editSource!;
    expect(source).toMatchObject({ kind: 'DIMENSION', expectedText: '*500±10' });
    expect(source.readOnlyReason).toBeUndefined();
    expect(parts.every((part) => part.editSource === source)).toBe(true);
    const view = { scale: 20, offsetX: 314, offsetY: -276 };
    const center = worldToScreen(view, { x: (line.a.x + line.b.x) / 2, y: (line.a.y + line.b.y) / 2 });
    expect(hitDwgEditSources(drawing, view, center, new Set())).toContain(source);
    expect(hitDwgEditSources(drawing, view, center, new Set([line.layer]))).not.toContain(source);

    const operations = updateDwgOperations([], source, '*750±10');
    const draft = previewDwgOperations(drawing, operations);
    expect(draft.entities.find((part) => part.kind === 'text' && part.editSource === source)).toMatchObject({ lines: ['*750±10'] });
    expect(draft.entities.find((part) => part.editSource?.handle === 'B72')?.editSource?.expectedText).toContain('插拔次数：500次');
    expect(draft.entities).toContain(line);
    expect(updateDwgOperations(operations, source, '*900±10')).toEqual([{ ...operations[0], newText: '*900±10' }]);
    expect(updateDwgOperations(operations, source, '*500±10')).toEqual([]);
    expect(previewDwgOperations(drawing, [])).toBe(drawing);
    expect(label.lines).toEqual(['*500±10']);
    expect(drawing.entities.some((part) => part.editSource?.kind === 'BLOCK' && part.editSource.readOnlyReason)).toBe(true);
  });

  it('leaves drawings with live dimension associations available for preview only', async () => {
    const name = 'M12A04-07-093-1-10-500.dwg';
    const drawing = await parseDwg(Uint8Array.from(readFileSync(name)).buffer, { fileName: name });
    const dimensions = drawing.entities.flatMap(({ editSource }) => editSource?.kind === 'DIMENSION' ? [editSource] : []);
    expect(dimensions.length).toBeGreaterThan(0);
    expect(dimensions.every((source) => source.readOnlyReason?.includes('关联尺寸'))).toBe(true);
  });
});
