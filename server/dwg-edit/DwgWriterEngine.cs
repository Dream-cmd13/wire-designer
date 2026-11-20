using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using ACadSharp;
using ACadSharp.Blocks;
using ACadSharp.Entities;
using ACadSharp.IO;

namespace DwgEdit;

public sealed record DwgOperation(string Handle, string Kind, string ExpectedText, string NewText);

public sealed class DwgEditException(string message, int status = 422) : Exception(message)
{
    public int Status { get; } = status;
}

public static class DwgWriterEngine
{
    public const int MaxBytes = 20 * 1024 * 1024;
    private static readonly Regex HashPattern = new(@"\A[0-9a-fA-F]{64}\z");

    public static CadDocument Read(byte[] bytes) => DwgReader.Read(new MemoryStream(bytes, writable: false));

    public static byte[] Write(CadDocument document)
    {
        using var output = new MemoryStream();
        DwgWriter.Write(output, document);
        return output.ToArray();
    }

    public static byte[] Edit(byte[] source, string hash, IReadOnlyList<DwgOperation?> operations, CancellationToken cancellation)
    {
        if (source.Length > MaxBytes) throw new DwgEditException("DWG 文件不能超过 20 MiB。", 413);
        if (!source.AsSpan().StartsWith("AC1018"u8)) throw new DwgEditException("当前仅支持修改 AC1018 图纸。");
        if (!HashPattern.IsMatch(hash) || !CryptographicOperations.FixedTimeEquals(Convert.FromHexString(hash), SHA256.HashData(source)))
            throw new DwgEditException("原件 SHA-256 不一致。", 409);
        if (operations.Count is < 1 or > 100) throw new DwgEditException("一次应提交 1 至 100 个对象。", 400);
        cancellation.ThrowIfCancellationRequested();

        var hasUnknownGraphics = false;
        var document = DwgReader.Read(new MemoryStream(source, writable: false), (_, notice) =>
        {
            if (notice.Message.Contains("as an UnknownEntity", StringComparison.Ordinal)) hasUnknownGraphics = true;
        });
        if (hasUnknownGraphics) throw new DwgEditException("包含无法保留的图形对象，图纸仅支持预览。");
        if (document.Classes.Any(item => item.DxfName == "DIMASSOC" && item.InstanceCount > 0))
            throw new DwgEditException("当前写入器无法保全关联尺寸，图纸仅支持预览。");
        if (document.BlockRecords.Any(block => (block.Flags & (BlockTypeFlags.XRef | BlockTypeFlags.XRefOverlay | BlockTypeFlags.XRefDependent)) != 0))
            throw new DwgEditException("包含外部 DWG 参照的图纸仅支持预览。");
        var drawingStructure = DrawingStructure(document);
        var layoutSettings = LayoutSettings(document);
        var rasterSettings = RasterSettings(document);
        var topLevel = document.Entities.ToDictionary(entity => entity.Handle);
        var pictureReferences = document.BlockRecords.SelectMany(block => block.Entities)
            .Select(entity => entity switch { Dimension dimension => dimension.Block, Insert insert => insert.Block, _ => null })
            .Where(block => block is not null).GroupBy(block => block!.Handle)
            .ToDictionary(group => group.Key, group => group.Count());
        var changes = new List<Change>();
        var seen = new HashSet<ulong>();
        foreach (var operation in operations)
        {
            cancellation.ThrowIfCancellationRequested();
            if (operation?.Handle is null || operation.Handle.Length is < 1 or > 16 ||
                !ulong.TryParse(operation.Handle, NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out var handle) ||
                handle == 0 || !seen.Add(handle) || operation.ExpectedText is null || operation.NewText is null)
                throw new DwgEditException("编辑操作缺少字段、句柄无效或重复。", 400);
            if (!topLevel.TryGetValue(handle, out var entity))
                throw new DwgEditException($"对象 {handle:X} 无法定位到模型空间。", 409);
            if (entity.XDictionary is not null)
                throw new DwgEditException($"对象 {handle:X} 关联扩展字典，仅支持预览。");
            var replacement = Normalize(operation.NewText);
            if (replacement.Length > 4096 || string.IsNullOrWhiteSpace(replacement) ||
                replacement.Any(character => char.IsControl(character) && character != '\n') ||
                replacement.Contains("%<") || replacement.Contains("<>"))
                throw new DwgEditException($"对象 {handle:X} 的新文字为空、过长或包含自动字段。");

            var (raw, multiline) = (operation.Kind, entity) switch
            {
                ("TEXT", TextEntity text) when text.ObjectType == ObjectType.TEXT => (text.Value, false),
                ("MTEXT", MText text) when !text.HasColumns && !text.IsAnnotative => (text.Value, true),
                ("DIMENSION", Dimension dimension) => (dimension.Text, true),
                _ => throw new DwgEditException($"对象 {handle:X} 类型不同或只读。")
            };
            var template = TextTemplate.Parse(raw, multiline);
            if (template.Visible != Normalize(operation.ExpectedText))
                throw new DwgEditException($"对象 {handle:X} 的原文字已变化。", 409);
            if (entity is not Dimension dim)
            {
                changes.Add(new(entity, template.Replace(replacement), null, null, null));
                continue;
            }

            var picture = dim.Block;
            if (picture is null || !Regex.IsMatch(picture.Name, @"\A\*D[0-9]+\z", RegexOptions.IgnoreCase) ||
                pictureReferences.GetValueOrDefault(picture.Handle) != 1)
                throw new DwgEditException($"尺寸 {handle:X} 的显示块缺失或被共享。");
            var labels = picture.Entities.OfType<IText>().ToArray();
            if (labels.Length != 1 || picture.Entities.Any(part => part is Dimension))
                throw new DwgEditException($"尺寸 {handle:X} 的显示文字无法唯一定位。");
            var label = labels[0];
            if (label is not Entity labelEntity || labelEntity.XDictionary is not null ||
                label is MText { HasColumns: true } or MText { IsAnnotative: true } ||
                label is not (MText or TextEntity { ObjectType: ObjectType.TEXT }))
                throw new DwgEditException($"尺寸 {handle:X} 的显示文字格式只读。");
            var labelTemplate = TextTemplate.Parse(label.Value, label is MText);
            if (labelTemplate.Visible != template.Visible)
                throw new DwgEditException($"尺寸 {handle:X} 与显示块文字不一致。");
            changes.Add(new(dim, template.Replace(replacement), label, labelTemplate.Replace(replacement), Geometry(dim)));
        }

        foreach (var change in changes)
        {
            if (change.Entity is Dimension dimension) dimension.Text = change.Value;
            else ((IText)change.Entity).Value = change.Value;
            if (change.Label is not null) change.Label.Value = change.LabelValue!;
        }

        cancellation.ThrowIfCancellationRequested();
        var output = Write(document);
        if (output.Length > MaxBytes) throw new DwgEditException("生成的 DWG 超过 20 MiB。", 413);
        cancellation.ThrowIfCancellationRequested();
        var checkedDocument = Read(output);
        if (!DrawingStructure(checkedDocument).SequenceEqual(drawingStructure) ||
            !LayoutSettings(checkedDocument).SequenceEqual(layoutSettings) ||
            !RasterSettings(checkedDocument).SequenceEqual(rasterSettings))
            throw new DwgEditException("图元、布局或光栅参照读回校验失败，未返回修订件。");
        foreach (var change in changes)
        {
            var result = checkedDocument.GetCadObject<Entity>(change.Entity.Handle);
            var valid = result?.GetType() == change.Entity.GetType() && (result switch
            {
                Dimension dimension => dimension.Text == change.Value && Geometry(dimension).SequenceEqual(change.Geometry!) &&
                    dimension.Block?.Handle == ((Dimension)change.Entity).Block.Handle &&
                    dimension.Block.Entities.OfType<IText>().SingleOrDefault()?.Value == change.LabelValue,
                IText text => text.Value == change.Value,
                _ => false
            });
            if (!valid) throw new DwgEditException("生成文件读回校验失败，未返回修订件。");
        }
        return output;
    }

    private static object[] Geometry(Dimension dimension) =>
        [dimension.Measurement, dimension.DefinitionPoint, dimension.TextMiddlePoint, dimension.InsertionPoint,
         dimension.Normal, dimension.TextRotation, dimension.HorizontalDirection, dimension.Style.Handle,
         dimension.FlipArrow1, dimension.FlipArrow2, dimension.Flags,
         ..(dimension switch
         {
             DimensionLinear linear => new object[] { linear.FirstPoint, linear.SecondPoint, linear.ExtLineRotation, linear.Rotation },
             DimensionAligned aligned => [aligned.FirstPoint, aligned.SecondPoint, aligned.ExtLineRotation],
             DimensionAngular2Line angular => [angular.FirstPoint, angular.SecondPoint, angular.AngleVertex, angular.DimensionArc],
             DimensionAngular3Pt angular => [angular.FirstPoint, angular.SecondPoint, angular.AngleVertex],
             DimensionDiameter diameter => [diameter.AngleVertex, diameter.LeaderLength],
             DimensionRadius radius => [radius.AngleVertex, radius.LeaderLength],
             DimensionOrdinate ordinate => [ordinate.FeatureLocation, ordinate.LeaderEndpoint, ordinate.IsOrdinateTypeX],
             DimensionArc arc => [arc.FirstPoint, arc.SecondPoint, arc.Center, arc.StartAngle, arc.EndAngle, arc.IsPartial,
                                  arc.HasLeader, arc.LeaderPoint1, arc.LeaderPoint2],
             _ => throw new DwgEditException("此尺寸类型仅支持预览。")
         })];

    internal static IEnumerable<object> DrawingStructure(CadDocument document) => document.BlockRecords.OrderBy(block => block.Handle)
        .SelectMany(block => block.Entities.OrderBy(entity => entity.Handle)
            .Select(entity => (object)new { Block = block.Handle, entity.Handle, entity.ObjectName, Layer = entity.Layer?.Name }));

    internal static IEnumerable<object> RasterSettings(CadDocument document) => document.BlockRecords.SelectMany(block => block.Entities)
        .OfType<RasterImage>().OrderBy(image => image.Handle).Select(image => (object)new { image.Handle, image.InsertPoint,
            image.UVector, image.VVector, image.Flags, image.Size, image.ClippingState, image.ClipType,
            ClipBoundary = string.Join(";", image.ClipBoundaryVertices), image.Brightness, image.Contrast, image.Fade,
            DefinitionPath = image.Definition?.FileName, DefinitionSize = image.Definition?.Size, DefinitionLoaded = image.Definition?.IsLoaded });

    internal static IEnumerable<object> LayoutSettings(CadDocument document) => document.Layouts.OrderBy(layout => layout.Name)
        .Select(layout => (object)new { layout.Name, layout.TabOrder, layout.MinLimits, layout.MaxLimits, layout.PageName,
            layout.PaperSize, layout.PaperWidth, layout.PaperHeight, layout.PaperRotation, layout.PaperUnits,
            layout.StyleSheet, layout.PlotType, layout.Flags, layout.SystemPrinterName, layout.PlotViewName,
            layout.NumeratorScale, layout.DenominatorScale, layout.WindowLowerLeftX, layout.WindowLowerLeftY,
            layout.WindowUpperLeftX, layout.WindowUpperLeftY, layout.UnprintableMargin });

    private static string Normalize(string value) => value.Replace("\r\n", "\n").Replace('\r', '\n');

    private sealed record Change(Entity Entity, string Value, IText? Label, string? LabelValue, object[]? Geometry);

    private sealed record TextTemplate(string Visible, string Prefix, string Suffix, bool Multiline)
    {
        private static readonly Regex LeadingFormat = new(@"\A(?:\\(?:[fF][^\\{};\r\n]+|H[0-9]*\.?[0-9]+[xX]?|C[0-9]+);)*");
        private static readonly Regex Tokens = new(@"\\[P\\{}~]|%%[dDpPcC%]|[^\\{}%]+|%(?!%)");
        private static readonly Regex SingleLineTokens = new(@"%%[dDpPcC%]|[^%\r\n]+|%(?!%)");

        public static TextTemplate Parse(string? raw, bool multiline)
        {
            if (string.IsNullOrWhiteSpace(raw) || raw.Contains("%<") || raw.Contains("<>")) throw Unsupported();
            var grouped = multiline && raw.StartsWith('{') && raw.EndsWith('}');
            var body = grouped ? raw[1..^1] : raw;
            var style = multiline ? LeadingFormat.Match(body).Value : "";
            body = body[style.Length..];
            var text = new StringBuilder();
            var position = 0;
            foreach (Match match in (multiline ? Tokens : SingleLineTokens).Matches(body))
            {
                if (match.Index != position) throw Unsupported();
                position += match.Length;
                text.Append(match.Value.ToLowerInvariant() switch
                {
                    "\\p" => "\n", "\\~" => "\u00a0", "\\{" => "{", "\\}" => "}", "\\\\" => "\\",
                    "%%d" => "°", "%%p" => "±", "%%c" => "⌀", "%%%" => "%", _ => match.Value
                });
            }
            if (position != body.Length || string.IsNullOrWhiteSpace(text.ToString())) throw Unsupported();
            return new(Normalize(text.ToString()), (grouped ? "{" : "") + style, grouped ? "}" : "", multiline);
        }

        public string Replace(string value)
        {
            if (!Multiline && value.Contains('\n')) throw new DwgEditException("单行文字不能换行。");
            var escaped = new StringBuilder();
            foreach (var character in value)
                escaped.Append(character switch
                {
                    '\n' => "\\P", '\\' when Multiline => "\\\\", '{' when Multiline => "\\{",
                    '}' when Multiline => "\\}", '\u00a0' when Multiline => "\\~", '⌀' => "%%c", '%' => "%%%",
                    _ => character.ToString()
                });
            return Prefix + escaped + Suffix;
        }

        private static DwgEditException Unsupported() => new("自动字段、测量值或复杂文字格式仅支持预览。");
    }
}
