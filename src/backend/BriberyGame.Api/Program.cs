using BriberyGame.Api.Hubs;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR();

var app = builder.Build();

app.MapGet("/", () => "Bribery Game API running");

app.MapHub<GameHub>("/hub/game");

app.Run();