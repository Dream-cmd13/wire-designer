import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import type { WorkBook } from 'xlsx';
import { extractSheetImages } from '@/lib/excelEmbeddedImages';

const drawingNs = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const mainNs = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const relNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const picture = '<xdr:pic><a:blip r:embed="image1" /></xdr:pic>';

function fixture(pictures = picture) {
  const files: Record<string, { content: string | Uint8Array }> = {
    'xl/workbook.xml': { content: '<workbook xmlns:r="' + relNs + '"><sheets><sheet name="测试&amp;表" r:id="sheet1" /></sheets></workbook>' },
    'xl/_rels/workbook.xml.rels': { content: '<Relationships><Relationship Id="sheet1" Target="worksheets/sheet1.xml" /></Relationships>' },
    'xl/worksheets/_rels/sheet1.xml.rels': { content: '<Relationships><Relationship Id="drawing1" Type="' + relNs + '/drawing" Target="../drawings/drawing1.xml" /></Relationships>' },
    'xl/drawings/drawing1.xml': { content: '<xdr:wsDr xmlns:xdr="' + drawingNs + '" xmlns:a="' + mainNs + '" xmlns:r="' + relNs + '">' + pictures + '</xdr:wsDr>' },
    'xl/drawings/_rels/drawing1.xml.rels': { content: '<Relationships><Relationship Id="image1" Target="../media/image1.png" /></Relationships>' },
    'xl/media/image1.png': { content: new Uint8Array([137, 80, 78, 71]) },
  };
  return { SheetNames: ['测试&表'], Sheets: { '测试&表': {} }, files } satisfies WorkBook & { files: typeof files };
}

afterEach(() => vi.unstubAllGlobals());

describe('extractSheetImages', () => {
  it.each([
    ['standard picture', picture],
    ['namespace on picture', picture.replace('<xdr:pic>', '<xdr:pic xmlns:xdr="' + drawingNs + '">')],
    ['alternative prefixes', '<d:pic xmlns:d="' + drawingNs + '" xmlns:m="' + mainNs + '" xmlns:rel="' + relNs + '"><m:blip rel:embed="image1" /></d:pic>'],
    ['default namespace', '<pic xmlns="' + drawingNs + '"><blip xmlns="' + mainNs + '" r:embed="image1" /></pic>'],
    ['single quotes', picture.replaceAll('"', "'")],
  ])('extracts %s', (_, xml) => {
    vi.stubGlobal('DOMParser', DOMParser);
    const images = extractSheetImages(fixture(xml), '测试&表');
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ mimeType: 'image/png', bytes: 4, dataUrl: 'data:image/png;base64,iVBORw==' });
  });

  it('deduplicates repeated media references', () => {
    vi.stubGlobal('DOMParser', DOMParser);
    expect(extractSheetImages(fixture(picture + picture), '测试&表')).toHaveLength(1);
  });

  it('ignores placeholders and missing media', () => {
    vi.stubGlobal('DOMParser', DOMParser);
    expect(extractSheetImages(fixture('<xdr:pic />'), '测试&表')).toEqual([]);
    const workbook = fixture();
    delete workbook.files['xl/media/image1.png'];
    expect(extractSheetImages(workbook, '测试&表')).toEqual([]);
  });

  it('handles missing raw files and unknown sheets', () => {
    vi.stubGlobal('DOMParser', DOMParser);
    expect(extractSheetImages({ SheetNames: [], Sheets: {} }, '测试&表')).toEqual([]);
    expect(extractSheetImages(fixture(), '不存在的表')).toEqual([]);
  });
});
