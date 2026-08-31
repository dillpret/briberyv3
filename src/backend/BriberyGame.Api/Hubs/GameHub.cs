namespace BriberyGame.Api.Hubs;

using Microsoft.AspNetCore.SignalR;
using BriberyGame.Api.Models;
using BriberyGame.Api.Services;

public class GameHub : Hub
{
    private readonly GameService _gameService;
    private readonly GameTelemetry _telemetry;
    private readonly ILogger<GameHub> _logger;

    public GameHub(
        GameService gameService,
        GameTelemetry telemetry,
        ILogger<GameHub> logger)
    {
        _gameService = gameService;
        _telemetry = telemetry;
        _logger = logger;
    }

    public async Task JoinLobby(string gameId, string playerId, string name)
    {
        var (resolvedGameId, result) =
            _gameService.Join(gameId, Context.ConnectionId, playerId, name, GetCountry());

        if (resolvedGameId == null || result == null)
        {
            await SendFailure("join_lobby", "JoinFailed", "Game does not exist");
            return;
        }

        if (!result.Success)
        {
            await SendFailure("join_lobby", "JoinFailed", result.Error);
            return;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, resolvedGameId);

        _logger.LogInformation("Player joined game from {Country}", GetCountry());
        await SendGameStateUpdates(resolvedGameId);
    }
    
    public async Task<string> CreateGame()
    {
        var gameId = _gameService.CreateGame(GetCountry());

        return gameId;
    }
    
    public async Task ToggleReady()
    {
        var (gameId, result) = _gameService.ToggleReady(Context.ConnectionId);

        if (gameId == null || result == null)
            return;

        if (!result.Success)
        {
            await SendFailure("toggle_ready", "ActionFailed", result.Error);
            return;
        }

        await SendGameStateUpdates(gameId);
    }
    
    public async Task StartGame()
    {
        var (gameId, result) =
            _gameService.StartGame(Context.ConnectionId, GetCountry());

        if (gameId == null || result == null)
            return;

        if (!result.Success)
        {
            await SendFailure("start_game", "StartFailed", result.Error);
            return;
        }

        _logger.LogInformation("Game started from {Country}", GetCountry());
        await SendGameStateUpdates(gameId);
    }

    public async Task UpdateGameSettings(GameSettings settings)
    {
        var (gameId, result) =
            _gameService.UpdateGameSettings(Context.ConnectionId, settings);

        if (gameId == null || result == null)
            return;

        if (!result.Success)
        {
            await SendFailure("update_game_settings", "ActionFailed", result.Error);
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
            await SendFailure("submit_prompt", "ActionFailed", result.Error);
            return;
        }

        await SendGameStateUpdates(gameId);
    }

    public async Task SavePromptDraft(string text, long clientDraftVersion)
    {
        var (gameId, result) =
            _gameService.SavePromptDraft(Context.ConnectionId, text, clientDraftVersion);

        if (gameId == null || result == null)
            return;

        if (!result.Success)
            await SendFailure("save_prompt_draft", "ActionFailed", result.Error);
    }

    public async Task EditPrompt()
    {
        var (gameId, result) = _gameService.EditPrompt(Context.ConnectionId);

        if (gameId == null || result == null)
            return;

        if (!result.Success)
        {
            await SendFailure("edit_prompt", "ActionFailed", result.Error);
            return;
        }

        await SendGameStateUpdates(gameId);
    }

    public async Task SubmitBribe(SubmitBribeRequest request)
    {
        var (gameId, result) =
            _gameService.SubmitBribe(Context.ConnectionId, request);

        if (gameId == null || result == null)
            return;

        if (!result.Success)
        {
            await SendFailure("submit_bribe", "ActionFailed", result.Error);
            return;
        }

        await SendGameStateUpdates(gameId);
    }

    public async Task SaveBribeDraft(SaveBribeDraftRequest request)
    {
        var (gameId, result) =
            _gameService.SaveBribeDraft(Context.ConnectionId, request);

        if (gameId == null || result == null)
            return;

        if (!result.Success)
            await SendFailure("save_bribe_draft", "ActionFailed", result.Error);
    }

    public async Task EditBribe(string targetPlayerId)
    {
        var (gameId, result) = _gameService.EditBribe(Context.ConnectionId, targetPlayerId);

        if (gameId == null || result == null)
            return;

        if (!result.Success)
        {
            await SendFailure("edit_bribe", "ActionFailed", result.Error);
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
            await SendFailure("submit_vote", "ActionFailed", result.Error);
            return;
        }

        await SendGameStateUpdates(gameId);
    }

    public async Task SaveVoteDraft(string bribeId, long clientDraftVersion)
    {
        var (gameId, result) =
            _gameService.SaveVoteDraft(Context.ConnectionId, bribeId, clientDraftVersion);

        if (gameId == null || result == null)
            return;

        if (!result.Success)
            await SendFailure("save_vote_draft", "ActionFailed", result.Error);
    }

    public async Task ToggleAppreciationCoin(string bribeId)
    {
        var (gameId, result) =
            _gameService.ToggleAppreciationCoin(Context.ConnectionId, bribeId);

        if (gameId == null || result == null)
            return;

        if (!result.Success)
        {
            await SendFailure("toggle_appreciation_coin", "ActionFailed", result.Error);
            return;
        }

        await SendGameStateUpdates(gameId);
    }

    public async Task SubmitAppreciationDone()
    {
        var (gameId, result) =
            _gameService.SubmitAppreciationDone(Context.ConnectionId);

        if (gameId == null || result == null)
            return;

        if (!result.Success)
        {
            await SendFailure("submit_appreciation_done", "ActionFailed", result.Error);
            return;
        }

        await SendGameStateUpdates(gameId);
    }

    public async Task StartNextRound()
    {
        var (gameId, result) =
            _gameService.StartNextRound(Context.ConnectionId);

        if (gameId == null || result == null)
            return;

        if (!result.Success)
        {
            await SendFailure("start_next_round", "ActionFailed", result.Error);
            return;
        }

        await SendGameStateUpdates(gameId);
    }

    public async Task AdvancePhaseWithoutOfflinePlayers()
    {
        var (gameId, result) =
            _gameService.AdvancePhaseWithoutOfflinePlayers(Context.ConnectionId);

        if (gameId == null || result == null)
            return;

        if (!result.Success)
        {
            await SendFailure("advance_phase_without_offline_players", "ActionFailed", result.Error);
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

    private async Task SendFailure(string action, string clientMethod, string? error)
    {
        _telemetry.ActionFailed(action);
        _logger.LogWarning("Game action failed: {Action}", action);
        await Clients.Caller.SendAsync(clientMethod, error);
    }

    private string GetCountry()
    {
        var headers = Context.GetHttpContext()?.Request.Headers;

        if (headers != null &&
            headers.TryGetValue("CF-IPCountry", out var country) &&
            !string.IsNullOrWhiteSpace(country))
            return country.ToString();

        return "unknown";
    }
}
