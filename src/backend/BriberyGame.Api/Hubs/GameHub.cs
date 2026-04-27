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

        await SendGameStateUpdates(resolvedGameId);
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

        await SendGameStateUpdates(gameId);
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

        await SendGameStateUpdates(gameId);
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

        await SendGameStateUpdates(gameId);
    }

    public async Task SubmitBribe(string targetPlayerId, string text)
    {
        var (gameId, result) =
            _gameService.SubmitBribe(Context.ConnectionId, targetPlayerId, text);

        if (gameId == null || result == null)
            return;

        if (!result.Success)
        {
            await Clients.Caller
                .SendAsync("ActionFailed", result.Error);
            return;
        }

        await SendGameStateUpdates(gameId);
    }

    public async Task SubmitVote(string bribeId)
    {
        var (gameId, result) =
            _gameService.SubmitVote(Context.ConnectionId, bribeId);

        if (gameId == null || result == null)
            return;

        if (!result.Success)
        {
            await Clients.Caller
                .SendAsync("ActionFailed", result.Error);
            return;
        }

        await SendGameStateUpdates(gameId);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var (gameId, state) =
            _gameService.Disconnect(Context.ConnectionId);

        if (gameId != null && state != null)
        {
            await SendGameStateUpdates(gameId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    private async Task SendGameStateUpdates(string gameId)
    {
        var states = _gameService.GetConnectedPlayerStates(gameId);

        foreach (var state in states)
        {
            await Clients.Client(state.ConnectionId)
                .SendAsync("GameStateUpdated", state.State);
        }
    }
}
