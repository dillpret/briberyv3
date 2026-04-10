namespace BriberyGame.Api.Hubs;

using Microsoft.AspNetCore.SignalR;
using BriberyGame.Api.Services;

public class GameHub : Hub
{
    private readonly GameService _gameService;

    public GameHub(GameService gameService)
    {
        _gameService = gameService;
    }

    public async Task JoinLobby(string playerId, string name)
    {
        var players = _gameService.Join(Context.ConnectionId, playerId, name);

        await Clients.All.SendAsync("PlayerListUpdated", players);
    }

    public override async Task OnConnectedAsync()
    {
        var players = _gameService.GetGame().Players;

        await Clients.Caller.SendAsync("PlayerListUpdated", players);

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var players = _gameService.Disconnect(Context.ConnectionId);

        await Clients.All.SendAsync("PlayerListUpdated", players);

        await base.OnDisconnectedAsync(exception);
    }
}