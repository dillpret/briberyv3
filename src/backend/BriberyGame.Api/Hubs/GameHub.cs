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
    
    public async Task ToggleReady()
    {
        var (gameId, state) = _gameService.ToggleReadyWithGame(Context.ConnectionId);

        if (gameId == null || state == null) return;

        await Clients.Group(gameId).SendAsync("LobbyUpdated", state);
    }
    
    public async Task StartGame()
    {
        var result = _gameService.StartGame(Context.ConnectionId);

        if (result == null) return;

        var (success, state) = result.Value;

        if (!success)
        {
            await Clients.Caller.SendAsync("StartFailed", "Not allowed to start");
            return;
        }

        var (gameId, _) = _gameService.Disconnect("__dummy__"); // placeholder

        // For now just broadcast updated state
        if (state != null)
        {
            await Clients.All.SendAsync("LobbyUpdated", state);
        }
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