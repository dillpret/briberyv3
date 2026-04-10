using Microsoft.AspNetCore.SignalR;

namespace BriberyGame.Api.Hubs;

public class GameHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        Console.WriteLine($"Connected: {Context.ConnectionId}");

        var players = new[]
        {
            new { id = "1", name = "Alice", connected = true },
            new { id = "2", name = "Bob", connected = true }
        };

        await Clients.Caller.SendAsync("PlayerListUpdated", players);

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        Console.WriteLine($"Disconnected: {Context.ConnectionId}");
        await base.OnDisconnectedAsync(exception);
    }
}