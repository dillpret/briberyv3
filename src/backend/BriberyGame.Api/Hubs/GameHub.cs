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
        var state = _gameService.Join(gameId, Context.ConnectionId, playerId, name);

        if (state == null)
        {
            await Clients.Caller.SendAsync("JoinFailed", "Game does not exist");
            return;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, gameId);

        await Clients.Group(gameId).SendAsync("LobbyUpdated", state);
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
        var (gameId, state) = _gameService.Disconnect(Context.ConnectionId);

        if (gameId != null && state != null)
        {
            await Clients.Group(gameId).SendAsync("LobbyUpdated", state);
        }

        await base.OnDisconnectedAsync(exception);
    }
}