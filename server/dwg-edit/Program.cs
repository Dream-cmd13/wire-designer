using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Reflection;
using System.Text;
using System.Text.Json;
using DwgEdit;
using Microsoft.AspNetCore.Http.Features;

var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
if (args is ["--convert", var directory])
{
    try
    {
        var input = await File.ReadAllBytesAsync(Path.Combine(directory, "source.dwg"));
        var request = JsonSerializer.Deserialize<ConversionRequest>(await File.ReadAllBytesAsync(Path.Combine(directory, "request.json")), json)!;
        var bytes = DwgWriterEngine.Edit(input, request.Hash, request.Operations, default);
        await File.WriteAllBytesAsync(Path.Combine(directory, "result.dwg"), bytes);
        return 0;
    }
    catch (DwgEditException error)
    {
        await File.WriteAllBytesAsync(Path.Combine(directory, "error.json"), JsonSerializer.SerializeToUtf8Bytes(new ConversionError(error.Status, error.Message), json));
        return 1;
    }
    catch (Exception)
    {
        return 2;
    }
}

const int requestLimit = DwgWriterEngine.MaxBytes + 256 * 1024;
var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = requestLimit);
builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = requestLimit;
    options.MemoryBufferThreshold = requestLimit;
    options.ValueLengthLimit = 192 * 1024;
});
builder.Services.AddHttpClient("Supabase", client => client.Timeout = TimeSpan.FromSeconds(8))
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
var app = builder.Build();
var slots = new SemaphoreSlim(2);

app.MapPost("/api/dwg/edit", async (HttpContext context, IHttpClientFactory clients) =>
{
    IResult Error(int status, string message) => Results.Json(new { message }, statusCode: status);
    context.Response.Headers.CacheControl = "no-store";
    var time = Stopwatch.StartNew();
    long size = 0;
    var phase = "authorization";
    var acquired = false;
    DirectoryInfo? scratch = null;
    using var deadline = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
    deadline.CancelAfter(TimeSpan.FromSeconds(45));
    var signal = deadline.Token;
    try
    {
        if (!AuthenticationHeaderValue.TryParse(context.Request.Headers.Authorization, out var auth) ||
            !auth.Scheme.Equals("Bearer", StringComparison.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(auth.Parameter))
            return Error(401, "请重新登录后生成 DWG。");
        var supabaseUrl = app.Configuration["DwgEdit:SupabaseUrl"]?.TrimEnd('/');
        var publishableKey = app.Configuration["DwgEdit:SupabaseKey"];
        if (!Uri.TryCreate(supabaseUrl, UriKind.Absolute, out var uri) ||
            (uri.Scheme != "https" && !(uri.IsLoopback && uri.Scheme == "http")) || string.IsNullOrEmpty(publishableKey))
            return Error(503, "DWG 写入服务尚未配置身份校验。");

        using var client = clients.CreateClient("Supabase");
        using var identity = new HttpRequestMessage(HttpMethod.Get, supabaseUrl + "/auth/v1/user");
        identity.Headers.Authorization = auth;
        identity.Headers.Add("apikey", publishableKey);
        using var userResponse = await client.SendAsync(identity, signal);
        if (userResponse.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            return Error(401, "登录已过期，请重新登录。");
        if (!userResponse.IsSuccessStatusCode)
            return Error(503, "暂时无法验证登录，请稍后重试。");
        using var caller = JsonDocument.Parse(await userResponse.Content.ReadAsStreamAsync(signal));
        if (!caller.RootElement.TryGetProperty("id", out var userId) || !Guid.TryParse(userId.GetString(), out _))
            return Error(401, "无法确认当前登录身份。");

        using var role = new HttpRequestMessage(HttpMethod.Post, supabaseUrl + "/rest/v1/rpc/current_app_role");
        role.Headers.Authorization = auth;
        role.Headers.Add("apikey", publishableKey);
        role.Content = new StringContent("{}", Encoding.UTF8, "application/json");
        using var roleResponse = await client.SendAsync(role, signal);
        if (!roleResponse.IsSuccessStatusCode)
            return Error(503, "暂时无法读取账号角色，请稍后重试。");
        if (await roleResponse.Content.ReadFromJsonAsync<string>(cancellationToken: signal) is not ("engineer" or "admin"))
            return Error(403, "仅工程师或管理员可以生成 DWG 修订件。");

        phase = "request";
        if (!context.Request.HasFormContentType) return Error(400, "请以表单提交原件和编辑操作。");
        if (!await slots.WaitAsync(0, signal)) return Error(429, "写入服务繁忙，请稍后重试。");
        acquired = true;
        var form = await context.Request.ReadFormAsync(signal);
        var source = form.Files.GetFile("source");
        size = source?.Length ?? 0;
        if (size > DwgWriterEngine.MaxBytes) return Error(413, "DWG 文件不能超过 20 MiB。");
        if (form.Files.Count != 1 || source is null || size < 6 || !source.FileName.EndsWith(".dwg", StringComparison.OrdinalIgnoreCase) ||
            form["sourceSha256"].Count != 1 || form["operations"].Count != 1)
            return Error(400, "请提交一份原 DWG、源哈希及编辑操作。");
        var operations = JsonSerializer.Deserialize<DwgOperation?[]>(form["operations"].ToString(), json);
        if (operations is null) return Error(400, "编辑操作无效。");

        phase = "conversion";
        scratch = Directory.CreateTempSubdirectory("dwg-edit-");
        await using (var stream = File.Create(Path.Combine(scratch.FullName, "source.dwg")))
            await source.CopyToAsync(stream, signal);
        await File.WriteAllBytesAsync(Path.Combine(scratch.FullName, "request.json"),
            JsonSerializer.SerializeToUtf8Bytes(new ConversionRequest(form["sourceSha256"].ToString(), operations), json), signal);
        var executable = Environment.ProcessPath ?? throw new InvalidOperationException();
        var start = new ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true };
        if (string.Equals(Path.GetFileNameWithoutExtension(executable), "dotnet", StringComparison.OrdinalIgnoreCase))
            start.ArgumentList.Add(Assembly.GetExecutingAssembly().Location);
        start.ArgumentList.Add("--convert");
        start.ArgumentList.Add(scratch.FullName);
        start.Environment.Remove("DwgEdit__SupabaseKey");
        using var worker = Process.Start(start) ?? throw new InvalidOperationException();
        try { await worker.WaitForExitAsync(signal); }
        catch (OperationCanceledException)
        {
            try { worker.Kill(entireProcessTree: true); }
            catch (InvalidOperationException) { }
            await worker.WaitForExitAsync();
            throw;
        }
        if (worker.ExitCode != 0)
        {
            if (worker.ExitCode == 1)
            {
                var errorBytes = await File.ReadAllBytesAsync(Path.Combine(scratch.FullName, "error.json"), signal);
                var error = JsonSerializer.Deserialize<ConversionError>(errorBytes, json)!;
                return Error(error.Status, error.Message);
            }
            app.Logger.LogWarning("DWG conversion failed with exit code {Code}", worker.ExitCode);
            return Error(422, "该 DWG 无法安全写回，当前草稿可以保留或撤回。");
        }
        var output = await File.ReadAllBytesAsync(Path.Combine(scratch.FullName, "result.dwg"), signal);
        return Results.Bytes(output, "application/octet-stream");
    }
    catch (OperationCanceledException)
    {
        return Error(context.RequestAborted.IsCancellationRequested ? 499 : 504, "DWG 生成已取消或超时，请重试。");
    }
    catch (BadHttpRequestException error) when (error.StatusCode == 413)
    {
        return Error(413, "DWG 文件不能超过 20 MiB。");
    }
    catch (Exception error) when (phase == "request" && error is InvalidDataException or JsonException)
    {
        return Error(400, "DWG 请求格式无效或超出限制。");
    }
    catch (Exception error)
    {
        app.Logger.LogWarning("DWG request failed at {Phase}: {ErrorType}", phase, error.GetType().Name);
        return Error(503, "DWG 写入服务暂不可用，请稍后重试。");
    }
    finally
    {
        if (scratch is not null)
        {
            try
            {
                foreach (var file in scratch.EnumerateFiles()) file.Delete();
                scratch.Delete();
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException)
            {
                app.Logger.LogError("DWG scratch cleanup failed: {ErrorType}", error.GetType().Name);
            }
        }
        if (acquired) slots.Release();
        app.Logger.LogInformation("DWG edit {Phase}, {Bytes} bytes, {Elapsed} ms", phase, size, time.ElapsedMilliseconds);
    }
});

await app.RunAsync();
return 0;

internal sealed record ConversionRequest(string Hash, DwgOperation?[] Operations);
internal sealed record ConversionError(int Status, string Message);
