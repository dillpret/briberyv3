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

    public async Task JoinLobby(string gameId, string playerId, string name)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, gameId);

        var players = _gameService.Join(gameId, Context.ConnectionId, playerId, name);

        await Clients.Group(gameId).SendAsync("PlayerListUpdated", players);
    }
    
    public async Task<string> CreateGame()
    {
        var gameId = _gameService.CreateGame();

        return gameId;
    }

    public override async Task OnConnectedAsync()
    {
        // Extra connected logic?

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var (gameId, players) = _gameService.Disconnect(Context.ConnectionId);

        if (gameId != null && players != null)
        {
            await Clients.Group(gameId).SendAsync("PlayerListUpdated", players);
        }

        await base.OnDisconnectedAsync(exception);
    }
}