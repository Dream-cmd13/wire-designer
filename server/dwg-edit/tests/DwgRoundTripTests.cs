using System.Security.Cryptography;
using ACadSharp;
using ACadSharp.Entities;
using ACadSharp.IO;
using Xunit.Abstractions;

namespace DwgEdit.Tests;

public class DwgRoundTripTests(ITestOutputHelper output)
{
    private const string Sample = "M12A05-07-068-3-10-500.dwg";
    private static readonly string Root = FindRoot();

    [Fact]
    public void UnmodifiedSamplesRetainTheAc1018DrawingStructure()
    {
        var files = Directory.GetFiles(Root, "*.dwg");
        Assert.Equal(9, files.Length);
        var stockBaseline = Environment.GetEnvironmentVariable("DWG_EDIT_STOCK_BASELINE") == "1";
        foreach (var file in files.Order())
        {
            var source = File.ReadAllBytes(file);
            var original = DwgWriterEngine.Read(source);
            var bytes = DwgWriterEngine.Write(original);
            var rewritten = DwgWriterEngine.Read(bytes);
            Assert.Equal(ACadVersion.AC1018, rewritten.Header.Version);
            Assert.Equal(original.BlockRecords.Select(block => (block.Name, block.Entities.Count)).Order(),
                         rewritten.BlockRecords.Select(block => (block.Name, block.Entities.Count)).Order());
            Assert.Equal(original.Layers.Select(layer => layer.Name).Order(), rewritten.Layers.Select(layer => layer.Name).Order());
            Assert.Equal(original.TextStyles.Select(style => (style.Name, style.Filename, style.BigFontFilename)).Order(),
                         rewritten.TextStyles.Select(style => (style.Name, style.Filename, style.BigFontFilename)).Order());
            Assert.Equal(original.LineTypes.Select(line => line.Name).Order(), rewritten.LineTypes.Select(line => line.Name).Order());
            if (!stockBaseline) Assert.Equal(PlotSettings(original), PlotSettings(rewritten));
            Assert.Equal(original.ImageDefinitions.Select(image => (image.FileName, image.Size, image.IsLoaded)).Order(),
                         rewritten.ImageDefinitions.Select(image => (image.FileName, image.Size, image.IsLoaded)).Order());
            output.WriteLine($"{Path.GetFileName(file)} {Hash(source)} -> {Hash(bytes)} | {rewritten.Entities.Count} entities, {rewritten.BlockRecords.Count} blocks");
            SaveEvidence(Path.GetFileNameWithoutExtension(file) + "_roundtrip.dwg", bytes);
        }
    }

    [Fact]
    public void ChangingOnlyTheParentLeavesTheDisplayBlockStale()
    {
        var source = File.ReadAllBytes(Path.Combine(Root, Sample));
        var document = DwgWriterEngine.Read(source);
        var parent = document.GetCadObject<DimensionLinear>(0x9F0);
        parent.Text = parent.Text.Replace("500", "750");
        var result = DwgWriterEngine.Read(DwgWriterEngine.Write(document)).GetCadObject<DimensionLinear>(0x9F0);
        Assert.Contains("*750±10", result.Text);
        Assert.Contains("*500±10", Assert.Single(result.Block.Entities.OfType<MText>()).Value);
    }

    [Fact]
    public void RefusesDrawingsWithActiveDimensionAssociations()
    {
        var source = File.ReadAllBytes(Path.Combine(Root, "M12A04-07-093-1-10-500.dwg"));
        var error = Assert.Throws<DwgEditException>(() => Edit(source, new("9F0", "DIMENSION", "*500±10", "*750±10")));
        Assert.Contains("关联尺寸", error.Message);
    }

    [Fact]
    public void EditsBothDimensionTextsWithoutChangingItsGeometryOrTheOther500()
    {
        var source = File.ReadAllBytes(Path.Combine(Root, Sample));
        var original = DwgWriterEngine.Read(source).GetCadObject<DimensionLinear>(0x9F0);
        var bytes = Edit(source, new("9F0", "DIMENSION", "*500±10", "*750±10"));
        var rewritten = DwgWriterEngine.Read(bytes);
        var dimension = rewritten.GetCadObject<DimensionLinear>(0x9F0);
        Assert.Equal("*D5", dimension.Block.Name);
        Assert.Equal(original.Text.Replace("500", "750"), dimension.Text);
        Assert.Equal(dimension.Text, Assert.Single(dimension.Block.Entities.OfType<MText>()).Value);
        Assert.Contains("插拔次数：500次", rewritten.GetCadObject<MText>(0xB72).Value);
        Assert.Equal(105.64115, dimension.Measurement, 5);
        Assert.Equal(original.DefinitionPoint, dimension.DefinitionPoint);
        Assert.Equal(original.FirstPoint, dimension.FirstPoint);
        Assert.Equal(original.SecondPoint, dimension.SecondPoint);
        Assert.Equal(source, File.ReadAllBytes(Path.Combine(Root, Sample)));
        SaveEvidence("M12A05-07-068-3-10-500_修订.dwg", bytes);
    }

    [Fact]
    public void EditsChineseParagraphsAndLiteralMtextCharacters()
    {
        var source = File.ReadAllBytes(Path.Combine(Root, Sample));
        var original = DwgWriterEngine.Read(source).GetCadObject<MText>(0xB72);
        var expected = original.Value.Replace("\\P", "\n");
        var bytes = Edit(source, new("B72", "MTEXT", expected, "技术要求：\n保留空格 {检查} \\  ±10 "));
        var text = DwgWriterEngine.Read(bytes).GetCadObject<MText>(0xB72);
        Assert.Equal(@"技术要求：\P保留空格 \{检查\} \\  ±10 ", text.Value);
        Assert.Equal(original.Style.Name, text.Style.Name);
        Assert.Equal(original.Height, text.Height);
        SaveEvidence("M12_technical.dwg", bytes);
    }

    [Fact]
    public void EditsTopLevelTextAndRejectsStaleDuplicateOrComplexOperations()
    {
        var document = new CadDocument(ACadVersion.AC1018);
        var plain = new TextEntity("  M12  ");
        var complex = new MText(@"{\H2x;大}{\H1x;小}");
        document.Entities.Add(plain);
        document.Entities.Add(complex);
        var source = DwgWriterEngine.Write(document);
        var change = new DwgOperation(plain.Handle.ToString("X"), "TEXT", "  M12  ", "  M20  ");
        var revised = DwgWriterEngine.Read(Edit(source, change));
        Assert.Equal(change.NewText, revised.GetCadObject<TextEntity>(plain.Handle).Value);
        Assert.Throws<DwgEditException>(() => Edit(source, change with { ExpectedText = "M12" }));
        Assert.Throws<DwgEditException>(() => Edit(source, change, change));
        Assert.Throws<DwgEditException>(() => Edit(source, change, new DwgOperation(complex.Handle.ToString("X"), "MTEXT", "大小", "更新")));
        Assert.Throws<DwgEditException>(() => DwgWriterEngine.Edit(source, new string('0', 64), [change], default));
        Assert.Equal(413, Assert.Throws<DwgEditException>(() => Edit(new byte[DwgWriterEngine.MaxBytes + 1], change)).Status);
    }

    private static byte[] Edit(byte[] source, DwgOperation first, params DwgOperation[] others) =>
        DwgWriterEngine.Edit(source, Hash(source), [first, ..others], default);

    private static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

    private static object[] PlotSettings(CadDocument document) => document.Layouts.OrderBy(layout => layout.Name)
        .Select(layout => (object)new { layout.Name, layout.TabOrder, layout.MinLimits, layout.MaxLimits, layout.PageName,
            layout.PaperSize, layout.PaperWidth, layout.PaperHeight, layout.PaperRotation, layout.PaperUnits,
            layout.StyleSheet, layout.PlotType, layout.Flags, layout.SystemPrinterName, layout.PlotViewName,
            layout.NumeratorScale, layout.DenominatorScale, layout.WindowLowerLeftX, layout.WindowLowerLeftY,
            layout.WindowUpperLeftX, layout.WindowUpperLeftY, layout.UnprintableMargin }).ToArray();

    private static void SaveEvidence(string name, byte[] bytes)
    {
        var directory = Environment.GetEnvironmentVariable("DWG_EDIT_EVIDENCE_DIR");
        if (string.IsNullOrEmpty(directory)) return;
        Directory.CreateDirectory(directory);
        File.WriteAllBytes(Path.Combine(directory, name), bytes);
    }

    private static string FindRoot()
    {
        var configured = Environment.GetEnvironmentVariable("DWG_EDIT_SAMPLE_DIR");
        if (configured is not null && File.Exists(Path.Combine(configured, Sample))) return configured;
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory != null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, Sample))) return directory.FullName;
        throw new FileNotFoundException(Sample);
    }
}
