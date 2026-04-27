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
        var (resolvedGameId, state) =
            _gameService.Join(gameId, Context.ConnectionId, playerId, name);

        if (resolvedGameId == null || state == null)
        {
            await Clients.Caller.SendAsync("JoinFailed", "Game does not exist");
            return;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, resolvedGameId);

        await Clients.Group(resolvedGameId)
            .SendAsync("LobbyUpdated", state);
    }
    
    public async Task<string> CreateGame()
    {
        var gameId = _gameService.CreateGame();

        return gameId;
    }
    
    public async Task ToggleReady()
    {
        var (gameId, result) = _gameService.ToggleReady(Context.ConnectionId);

        if (gameId == null || result == null)
            return;

        if (!result.Success)
        {
            await Clients.Caller.SendAsync("ActionFailed", result.Error);
            return;
        }

        await Clients.Group(gameId).SendAsync("LobbyUpdated", result.Data);
    }
    
    public async Task StartGame()
    {
        var (gameId, result) =
            _gameService.StartGame(Context.ConnectionId);

        if (gameId == null || result == null)
            return;

        if (!result.Success)
        {
            await Clients.Caller
                .SendAsync("StartFailed", result.Error);
            return;
        }

        await Clients.Group(gameId)
            .SendAsync("LobbyUpdated", result.Data);
    }

    public async Task SubmitPrompt(string text)
    {
        var (gameId, result) =
            _gameService.SubmitPrompt(Context.ConnectionId, text);

        if (gameId == null || result == null)
            return;

        if (!result.Success)
        {
            await Clients.Caller
                .SendAsync("ActionFailed", result.Error);
            return;
        }

        await Clients.Group(gameId)
            .SendAsync("LobbyUpdated", result.Data);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var (gameId, state) =
            _gameService.Disconnect(Context.ConnectionId);

        if (gameId != null && state != null)
        {
            await Clients.Group(gameId)
                .SendAsync("LobbyUpdated", state);
        }

        await base.OnDisconnectedAsync(exception);
    }
}
