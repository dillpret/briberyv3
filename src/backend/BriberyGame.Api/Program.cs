using BriberyGame.Api.Hubs;
using BriberyGame.Api.Services;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

var builder = WebApplication.CreateBuilder(args);
var otlpExporterEnabled = !string.IsNullOrWhiteSpace(
    builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]);

builder.Logging.AddOpenTelemetry(logging =>
{
    logging.IncludeFormattedMessage = true;
    logging.IncludeScopes = true;
    logging.ParseStateValues = true;

    if (otlpExporterEnabled)
        logging.AddOtlpExporter();
});

builder.Services.AddOpenTelemetry()
    .ConfigureResource(resource => resource
        .AddService(
            serviceName: "bribery-game-api",
            serviceNamespace: "bribery"))
    .WithMetrics(metrics =>
    {
        metrics
            .AddAspNetCoreInstrumentation()
            .AddRuntimeInstrumentation()
            .AddMeter(GameTelemetry.MeterName);

        if (otlpExporterEnabled)
            metrics.AddOtlpExporter();
    })
    .WithTracing(tracing =>
    {
        tracing.AddAspNetCoreInstrumentation();

        if (otlpExporterEnabled)
            tracing.AddOtlpExporter();
    });

builder.Services.AddSignalR(options =>
    {
        options.ClientTimeoutInterval = TimeSpan.FromMinutes(2);
        options.KeepAliveInterval = TimeSpan.FromSeconds(15);
        options.HandshakeTimeout = TimeSpan.FromSeconds(30);
        options.MaximumReceiveMessageSize = 128 * 1024;
    })
    .AddJsonProtocol(options =>
    {
        options.PayloadSerializerOptions.Converters.Add(
            new System.Text.Json.Serialization.JsonStringEnumConverter());
    });

builder.Services.AddSingleton<MediaStore>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<GameTelemetry>();
builder.Services.AddSingleton<GameService>();
builder.Services.AddHostedService<PhaseTimerWorker>();

// builder.Services.AddCors(options =>
// {
//     options.AddDefaultPolicy(policy =>
//     {
//         policy
//             .WithOrigins(
//                 "http://localhost:4200",
//                 "http://localhost:8080"
//             )
//             .AllowAnyHeader()
//             .AllowAnyMethod()
//             .AllowCredentials();
//     });
// });

builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(options =>
{
    options.SerializerOptions.Converters.Add(
        new System.Text.Json.Serialization.JsonStringEnumConverter());
});

var app = builder.Build();

var webRootPath = app.Environment.WebRootPath
    ?? Path.Combine(app.Environment.ContentRootPath, "wwwroot");
var spaIndexPath = Path.Combine(webRootPath, "index.html");
var hasSpaAssets = File.Exists(spaIndexPath);

if (hasSpaAssets)
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
}

// app.UseCors();

app.MapPost("/api/games/{gameId}/media", async (
    string gameId,
    HttpRequest request,
    GameService gameService,
    GameTelemetry telemetry) =>
{
    if (!request.HasFormContentType)
        return Results.BadRequest(new { error = "Expected multipart form data" });

    var form = await request.ReadFormAsync();
    var playerId = form["playerId"].ToString();
    var file = form.Files["file"];

    if (string.IsNullOrWhiteSpace(playerId))
        return Results.BadRequest(new { error = "Player is required" });

    if (file == null || file.Length == 0)
        return Results.BadRequest(new { error = "Media file is required" });

    if (file.Length > MediaStore.MaxMediaBytes)
        return Results.BadRequest(new { error = "Media bribe cannot exceed 8 MB" });

    if (!MediaStore.IsAllowedContentType(file.ContentType))
        return Results.BadRequest(new { error = "Media bribe must be a supported image or GIF" });

    await using var stream = file.OpenReadStream();
    using var memory = new MemoryStream();
    await stream.CopyToAsync(memory);

    var result = gameService.StoreMedia(
        gameId,
        playerId,
        file.ContentType,
        file.Length,
        memory.ToArray());

    if (!result.Success)
        return Results.BadRequest(new { error = result.Error });

    telemetry.MediaUploaded(file.Length, file.ContentType);

    return Results.Ok(result.Data);
})
.DisableAntiforgery();

app.MapGet("/api/media/{mediaId}", (string mediaId, GameService gameService) =>
{
    var media = gameService.GetMedia(mediaId);

    return media == null
        ? Results.NotFound()
        : Results.File(media.Bytes, media.ContentType);
});

app.MapHub<GameHub>("/hub/game");

if (hasSpaAssets)
    app.MapFallbackToFile("index.html");

app.Run();
