using Microsoft.AspNetCore.SignalR;

namespace BriberyGame.Api.Hubs;

public class GameHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        Console.WriteLine($"Connected: {Context.ConnectionId}");
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        Console.WriteLine($"Disconnected: {Context.ConnectionId}");
        await base.OnDisconnectedAsync(exception);
    }
}