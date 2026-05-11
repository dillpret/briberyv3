namespace BriberyGame.Api.Services;

using System.Collections.Concurrent;
using BriberyGame.Api.Models;

public class GameService
{
    private readonly ConcurrentDictionary<string, string> _connectionToGame = new();
    private readonly ConcurrentDictionary<string, Game> _games = new();
    private readonly MediaStore _mediaStore;
    
    private static readonly char[] _chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".ToCharArray();

    private readonly Random _random = new();

    public GameService()
        : this(new MediaStore())
    {
    }

    public GameService(MediaStore mediaStore)
    {
        _mediaStore = mediaStore;
    }
    
    public string CreateGame()
    {
        string gameId;
        
        do
        {
            gameId = GenerateGameId();
        }
        while (_games.ContainsKey(gameId));
        
        _games[gameId] = new Game(gameId);
        
        return gameId;
    }
    
    public (string? gameId, Result<GameStateDto>? result) Join(
        string gameId,
        string connectionId,
        string playerId,
        string name)
    {
        var normalizedGameId = NormalizeGameId(gameId);
        var game = GetGame(normalizedGameId);
        if (game == null) return (null, null);

        var result = game.Join(connectionId, playerId, name);
        if (!result.Success)
        {
            _connectionToGame.TryRemove(connectionId, out _);
            return (normalizedGameId, result);
        }

        _connectionToGame[connectionId] = normalizedGameId;
        RemoveStaleConnectionMappings(normalizedGameId, game);

        return (normalizedGameId, result);
    }

    public (string? gameId, GameStateDto? state) Disconnect(string connectionId)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        var state = game.Disconnect(connectionId);
        _connectionToGame.TryRemove(connectionId, out _);

        return (gameId, state);
    }
    
    public (string? gameId, Result<GameStateDto>? result) ToggleReady(string connectionId)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        var result = game.ToggleReady(connectionId);

        return (gameId, result);
    }
    
    public (string? gameId, Result<GameStateDto>? result) StartGame(string connectionId)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        var existingMediaIds = GetSubmittedMediaIds(game);
        var result = game.StartGame(connectionId);
        if (gameId != null && result.Success)
            _mediaStore.Remove(existingMediaIds);

        return (gameId, result);
    }

    public (string? gameId, Result<GameStateDto>? result) SubmitPrompt(string connectionId, string text)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        var result = game.SubmitPrompt(connectionId, text);

        return (gameId, result);
    }

    public (string? gameId, Result<GameStateDto>? result) SubmitBribe(
        string connectionId,
        string targetPlayerId,
        string text)
    {
        return SubmitBribe(connectionId, new SubmitBribeRequest
        {
            TargetPlayerId = targetPlayerId,
            Text = text
        });
    }

    public (string? gameId, Result<GameStateDto>? result) SubmitBribe(
        string connectionId,
        SubmitBribeRequest request)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        var player = game.State.Players.FirstOrDefault(p => p.ConnectionId == connectionId);
        if (player == null)
            return (gameId, Result<GameStateDto>.Fail("Player not found"));

        if (request.Media != null)
        {
            var mediaResult = _mediaStore.ReserveForBribe(
                gameId!,
                player.Id,
                request.Media,
                GetActiveMediaBudgetBytes(game));

            if (!mediaResult.Success)
                return (gameId, Result<GameStateDto>.Fail(mediaResult.Error!));

            request.Media = mediaResult.Data;
        }

        var result = game.SubmitBribe(connectionId, request);

        if (!result.Success && request.Media != null)
            _mediaStore.Remove(request.Media.MediaId);

        return (gameId, result);
    }

    public (string? gameId, Result<GameStateDto>? result) SubmitVote(
        string connectionId,
        string bribeId)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        var result = game.SubmitVote(connectionId, bribeId);

        return (gameId, result);
    }

    public (string? gameId, Result<GameStateDto>? result) StartNextRound(string connectionId)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        var existingMediaIds = GetSubmittedMediaIds(game);
        var result = game.StartNextRound(connectionId);
        if (result.Success)
            _mediaStore.Remove(existingMediaIds);

        return (gameId, result);
    }

    public (string? gameId, Result<GameStateDto>? result) AdvancePhaseWithoutOfflinePlayers(string connectionId)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        var beforeMediaIds = GetSubmittedMediaIds(game);
        var result = game.AdvancePhaseWithoutOfflinePlayers(connectionId);
        if (result.Success)
        {
            var remainingMediaIds = GetSubmittedMediaIds(game);
            _mediaStore.Remove(beforeMediaIds.Except(remainingMediaIds));
        }

        return (gameId, result);
    }

    public List<ConnectionGameStateDto> GetConnectedPlayerStates(string gameId)
    {
        var game = GetGame(gameId);
        return game?.GetConnectedPlayerStates() ?? [];
    }

    public Result<BribeMedia> StoreMedia(
        string gameId,
        string playerId,
        string contentType,
        long byteSize,
        byte[] bytes)
    {
        var normalizedGameId = NormalizeGameId(gameId);
        var game = GetGame(normalizedGameId);
        if (game == null)
            return Result<BribeMedia>.Fail("Game does not exist");

        if (game.State.Players.All(player => player.Id != playerId))
            return Result<BribeMedia>.Fail("Player not found");

        return _mediaStore.Store(normalizedGameId, playerId, contentType, byteSize, bytes);
    }

    public StoredMedia? GetMedia(string mediaId)
    {
        return _mediaStore.Get(mediaId);
    }
    
    private (string? gameId, Game? game) ResolveGame(string connectionId)
    {
        if (!_connectionToGame.TryGetValue(connectionId, out var gameId))
            return (null, null);

        var game = GetGame(gameId);
        if (game == null)
            return (null, null);

        return (gameId, game);
    }
    
    private Game? GetGame(string gameId)
    {
        _games.TryGetValue(NormalizeGameId(gameId), out var game);
        return game;
    }

    private void RemoveStaleConnectionMappings(string gameId, Game game)
    {
        foreach (var mapping in _connectionToGame)
        {
            if (mapping.Value == gameId && !game.HasConnection(mapping.Key))
                _connectionToGame.TryRemove(mapping.Key, out _);
        }
    }

    private static string NormalizeGameId(string gameId)
    {
        return gameId.Trim().ToUpperInvariant();
    }

    private string GenerateGameId()
    {
        return new string(Enumerable.Range(0, 4)
            .Select(_ => _chars[_random.Next(_chars.Length)])
            .ToArray());
    }

    private static IEnumerable<string> GetSubmittedMediaIds(Game game)
    {
        return game.State.Bribes.Values
            .Where(bribe => bribe.Media != null)
            .Select(bribe => bribe.Media!.MediaId)
            .ToList();
    }

    private static long GetActiveMediaBudgetBytes(Game game)
    {
        var activePlayerIds = game.State.Players
            .Where(player => player.IsActive)
            .Select(player => player.Id)
            .ToHashSet();

        var requiredBribes = game.State.TargetAssignments
            .Where(assignment => activePlayerIds.Contains(assignment.Key))
            .SelectMany(assignment => assignment.Value
                .Where(activePlayerIds.Contains)
                .Distinct())
            .Count();

        return Math.Max(requiredBribes, 1) * Game.MaxMediaBribeBytes;
    }
}
