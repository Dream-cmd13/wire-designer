import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const vendor = fileURLToPath(new URL('./vendor/', import.meta.url));
const checkout = join(vendor, 'ACadSharp');
const marker = join(checkout, '.dwg-edit-prepared');
const writer = 'src/ACadSharp/IO/DWG/DwgStreamWriters';
const reader = 'src/ACadSharp/IO/DWG/DwgStreamReaders/DwgObjectReader.cs';
const commit = '90c6f871ff6f37a66170316ebd7a736c1b1ca828';
const utilities = 'a6505ab24bb45eac91e912179b2049136b7e88af';

function runGit(directory, ...command) {
  return execFileSync('git', ['-C', directory, ...command], { encoding: 'utf8' }).trim();
}

mkdirSync(vendor, { recursive: true });
if (!existsSync(checkout)) {
  runGit(vendor, 'clone', '--depth', '1', '--branch', 'v3.8.35', '--recurse-submodules', '--shallow-submodules',
    'https://github.com/DomCR/ACadSharp.git', checkout);
}
if (runGit(checkout, 'rev-parse', 'HEAD') !== commit || runGit(join(checkout, 'src/CSUtilities'), 'rev-parse', 'HEAD') !== utilities) {
  throw new Error('Unexpected ACadSharp source revision. Check server/dwg-edit/vendor/ACadSharp.');
}

function replaceOnce(relativePath, original, fixed) {
  const path = join(checkout, relativePath);
  const current = readFileSync(path, 'utf8');
  const normalized = current.replaceAll('\r\n', '\n');
  if (normalized.includes(fixed)) return;
  const pieces = normalized.split(original);
  if (pieces.length !== 2) throw new Error(`Unexpected source in ${relativePath}`);
  const result = pieces.join(fixed);
  writeFileSync(path, current.includes('\r\n') ? result.replaceAll('\n', '\r\n') : result);
}

replaceOnce('src/ACadSharp/ACadSharp.csproj',
  '<TargetFrameworks>net8.0;net9.0;net10.0;net48;netstandard2.1;netstandard2.0</TargetFrameworks>',
  '<TargetFramework>net8.0</TargetFramework>');
replaceOnce('src/ACadSharp/ACadSharp.csproj',
  '<GenerateDocumentationFile>true</GenerateDocumentationFile>',
  '<GenerateDocumentationFile>false</GenerateDocumentationFile>\n\t\t<LangVersion>preview</LangVersion>');
replaceOnce(`${writer}/DwgObjectWriter.Objects.cs`,
  '//Limmax 2RD 11 layout maximum limits\n\t\tthis._writer.Write2RawDouble(layout.MinLimits);',
  '//Limmax 2RD 11 layout maximum limits\n\t\tthis._writer.Write2RawDouble(layout.MaxLimits);');
replaceOnce(`${writer}/DwgFileHeaderWriterAC18.cs`,
  'this.FileHeader.SectionAmount = (uint)(this._localSectionsMaps.Count - 1);',
  'this.FileHeader.SectionAmount = (uint)this._localSectionsMaps.Count;');
replaceOnce('src/ACadSharp/Tables/LineType.cs',
  'public double PatternLength',
  'internal double? DwgPatternLength { get; set; }\n\n\tpublic double PatternLength');
replaceOnce(reader, 'template.TotalLen = this._objectReader.ReadBitDouble();',
  'template.TotalLen = ltype.DwgPatternLength = this._objectReader.ReadBitDouble();');
replaceOnce(`${writer}/DwgObjectWriter.cs`,
  'this._writer.WriteBitDouble(ltype.PatternLength);',
  'this._writer.WriteBitDouble(ltype.DwgPatternLength ?? ltype.PatternLength);');
replaceOnce('src/ACadSharp/Entities/Dimension.cs',
  'protected BlockRecord _block;',
  'internal byte? DwgFlags { get; set; }\n\tinternal XYZ DwgPictureScale { get; set; } = new XYZ(1);\n\tinternal double DwgPictureRotation { get; set; }\n\n\tprotected BlockRecord _block;');
replaceOnce(reader,
  'dimension.IsTextUserDefinedLocation = (flags & 0b01) == 0;',
  'dimension.DwgFlags = flags;\n\t\t\tdimension.IsTextUserDefinedLocation = (flags & 0b01) == 0;');
replaceOnce(reader, 'var insertionScaleFactor = new XYZ(', 'dimension.DwgPictureScale = new XYZ(');
replaceOnce(reader, 'var insertionRotation = this._objectReader.ReadBitDouble();', 'dimension.DwgPictureRotation = this._objectReader.ReadBitDouble();');
replaceOnce(`${writer}/DwgObjectWriter.Entities.cs`, 'byte flags = 0;\n\t\tflags |= dimension.IsTextUserDefinedLocation',
  'byte flags = (byte)((dimension.DwgFlags ?? 0b10) & 0xFE);\n\t\tflags |= dimension.IsTextUserDefinedLocation');
replaceOnce(`${writer}/DwgObjectWriter.Entities.cs`, 'this._writer.Write3BitDouble(new XYZ(1));',
  'this._writer.Write3BitDouble(dimension.DwgPictureScale);');
replaceOnce(`${writer}/DwgObjectWriter.Entities.cs`,
  '//ALL OF THEM can be set via DXFIN, however.\n\t\tthis._writer.WriteBitDouble(0);',
  '//ALL OF THEM can be set via DXFIN, however.\n\t\tthis._writer.WriteBitDouble(dimension.DwgPictureRotation);');
replaceOnce('src/ACadSharp/IO/DWG/FileHeaders/DwgFileHeader.cs',
  'public CodePage DrawingCodePage { get; set; }',
  'public CodePage DrawingCodePage { get; set; }\n\t\tpublic short RawDrawingCodePage { get; set; }');
replaceOnce('src/ACadSharp/Header/CadHeader.cs',
  'public string CodePage { get; set; } = "ANSI_1252";',
  'public string CodePage { get; set; } = "ANSI_1252";\n\n\tinternal short DwgCodePageIndex { get; set; }');
replaceOnce('src/ACadSharp/IO/DwgReader.cs',
  'header.CodePage = CadUtils.GetCodePageName(this._fileHeader.DrawingCodePage);',
  'header.CodePage = CadUtils.GetCodePageName(this._fileHeader.DrawingCodePage);\n\t\theader.DwgCodePageIndex = this._fileHeader.RawDrawingCodePage;');
replaceOnce('src/ACadSharp/IO/DwgReader.cs',
  'fileheader.DrawingCodePage = CadUtils.GetCodePage(sreader.ReadShort());\n\t\tthis._encoding = sreader.Encoding',
  'fileheader.RawDrawingCodePage = sreader.ReadShort();\n\t\tfileheader.DrawingCodePage = CadUtils.GetCodePage(fileheader.RawDrawingCodePage);\n\t\tthis._encoding = sreader.Encoding');
replaceOnce(`${writer}/DwgFileHeaderWriterBase.cs`,
  'ushort codePage = (ushort)CadUtils.GetCodeIndex(CadUtils.GetCodePage(_document.Header.CodePage));',
  'short original = _document.Header.DwgCodePageIndex;\n\t\tvar encoding = CadUtils.GetCodePage(_document.Header.CodePage);\n\t\tushort codePage = (ushort)(original > 0 && CadUtils.GetCodePage(original) == encoding ? original : CadUtils.GetCodeIndex(encoding));');
replaceOnce('src/ACadSharp/Objects/Layout.cs',
  'private Viewport _lastViewport;', 'private Viewport _lastViewport;\n\n\tinternal ulong DwgActiveViewportHandle { get; set; }');
replaceOnce(reader, 'template.ActiveViewportHandle = this.handleReference();',
  'template.ActiveViewportHandle = layout.DwgActiveViewportHandle = this.handleReference();');
replaceOnce(`${writer}/DwgObjectWriter.Objects.cs`,
  'this._writer.HandleReference(DwgReferenceType.SoftPointer, layout.LastActiveViewport);',
  'this._writer.HandleReference(DwgReferenceType.SoftPointer, layout.LastActiveViewport?.Handle ?? layout.DwgActiveViewportHandle);');
replaceOnce('src/ACadSharp/Entities/CadWipeoutBase.cs',
  'private ImageDefinitionReactor _definitionReactor;',
  'private ImageDefinitionReactor _definitionReactor;\n\n\tinternal byte[] DwgPreviewBytes { get; set; }\n\tinternal ClipType? DwgClipType { get; set; }');
replaceOnce(reader, 'template.ProxyGraphics = this._objectReader.ReadBytes((int)graphicImageSize);',
  'template.ProxyGraphics = this._objectReader.ReadBytes((int)graphicImageSize);\n\t\t\t\tif (template.CadObject is CadWipeoutBase image) image.DwgPreviewBytes = template.ProxyGraphics;');
replaceOnce(reader, 'var clipType = (ClipType)this._objectReader.ReadBitShort();',
  'var clipType = (ClipType)this._objectReader.ReadBitShort();\n\t\t\timage.DwgClipType = clipType;');
replaceOnce(`${writer}/DwgObjectWriter.Entities.cs`,
  'this._writer.WriteBitShort((short)image.ClipType);\n\n\t\tswitch (image.ClipType)',
  'var clipType = image.DwgClipType ?? image.ClipType;\n\t\tthis._writer.WriteBitShort((short)clipType);\n\n\t\tswitch (clipType)');
replaceOnce(`${writer}/DwgObjectWriter.cs`, 'if (entity.HasProxyGeometries)',
  'var imagePreview = (entity as CadWipeoutBase)?.DwgPreviewBytes;\n\t\tif (imagePreview != null || entity.HasProxyGeometries)');
replaceOnce(`${writer}/DwgObjectWriter.cs`,
  'var graphics = ProxyGeometryWriter.WriteGeometries(this._version, this._writer.Encoding, entity.ProxyGeometries);',
  'var graphics = imagePreview ?? ProxyGeometryWriter.WriteGeometries(this._version, this._writer.Encoding, entity.ProxyGeometries);');
replaceOnce('src/ACadSharp/CadDocument.cs',
  'var reactors = this._cadObjects.Values.OfType<ImageDefinitionReactor>().ToList();',
  'var preserved = this._cadObjects.Values.OfType<RasterImage>().Select(image => image.DefinitionReactor).Where(reactor => reactor != null).ToHashSet();\n\t\tvar reactors = this._cadObjects.Values.OfType<ImageDefinitionReactor>().Where(reactor => !preserved.Contains(reactor)).ToList();');
replaceOnce('src/ACadSharp/CadDocument.cs',
  'image.DefinitionReactor = new ImageDefinitionReactor(image);',
  'if (image.DefinitionReactor != null)\n\t\t\t{\n\t\t\t\tif (image.DefinitionReactor.Document == null) this.AddCadObject(image.DefinitionReactor);\n\t\t\t\timage.Definition.AddReactor(image.DefinitionReactor);\n\t\t\t\tcontinue;\n\t\t\t}\n\t\t\timage.DefinitionReactor = new ImageDefinitionReactor(image);');

writeFileSync(marker, `${commit}\n${utilities}\n`);
console.log('Prepared ACadSharp v3.8.35 with AC1018 preservation fixes.');
