using Microsoft.AspNetCore.SignalR;

namespace BriberyGame.Api.Hubs;

public class GameHub : Hub
{
    private static readonly List<Player> Players = new();

    public async Task JoinLobby(string name)
    {
        var player = new Player
        {
            Id = Context.ConnectionId,
            Name = name,
            Connected = true
        };

        Players.Add(player);

        await Clients.All.SendAsync("PlayerListUpdated", Players);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var player = Players.FirstOrDefault(p => p.Id == Context.ConnectionId);

        if (player != null)
        {
            player.Connected = false;
            await Clients.All.SendAsync("PlayerListUpdated", Players);
        }

        await base.OnDisconnectedAsync(exception);
    }
}

public class Player
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public bool Connected { get; set; }
}