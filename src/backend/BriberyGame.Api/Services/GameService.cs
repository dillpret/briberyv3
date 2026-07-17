namespace BriberyGame.Api.Services;

using System.Collections.Concurrent;
using BriberyGame.Api.Models;

public class GameService
{
    private readonly ConcurrentDictionary<string, string> _connectionToGame = new();
    private readonly ConcurrentDictionary<string, GameSession> _games = new();
    private readonly MediaStore _mediaStore;
    private readonly Func<DateTimeOffset> _now;
    private static readonly TimeSpan InactiveRoomTtl = TimeSpan.FromMinutes(15);
    
    private static readonly char[] _chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".ToCharArray();

    private readonly Random _random = new();

    public GameService()
        : this(new MediaStore())
    {
    }

    public GameService(MediaStore mediaStore)
        : this(mediaStore, TimeProvider.System)
    {
    }

    public GameService(MediaStore mediaStore, TimeProvider timeProvider)
        : this(mediaStore, () => timeProvider.GetUtcNow())
    {
    }

    public GameService(MediaStore mediaStore, Func<DateTimeOffset> now)
    {
        _mediaStore = mediaStore;
        _now = now;
    }
    
    public string CreateGame()
    {
        CleanupInactiveGames();

        string gameId;
        
        do
        {
            gameId = GenerateGameId();
        }
        while (_games.ContainsKey(gameId));
        
        _games[gameId] = new GameSession(new Game(gameId, _now))
        {
            EmptySince = _now()
        };
        
        return gameId;
    }
    
    public (string? gameId, Result<GameStateDto>? result) Join(
        string gameId,
        string connectionId,
        string playerId,
        string name)
    {
        CleanupInactiveGames();

        var normalizedGameId = NormalizeGameId(gameId);
        var game = GetGame(normalizedGameId);
        if (game == null) return (null, null);

        Result<GameStateDto> result;
        lock (game)
        {
            result = game.Join(connectionId, playerId, name);
        }
        if (!result.Success)
        {
            _connectionToGame.TryRemove(connectionId, out _);
            return (normalizedGameId, result);
        }

        _connectionToGame[connectionId] = normalizedGameId;
        MarkActivity(normalizedGameId, game);
        RemoveStaleConnectionMappings(normalizedGameId, game);

        return (normalizedGameId, result);
    }

    public (string? gameId, GameStateDto? state) Disconnect(string connectionId)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (gameId == null || game == null) return (null, null);

        GameStateDto state;
        lock (game)
        {
            state = game.Disconnect(connectionId);
        }
        _connectionToGame.TryRemove(connectionId, out _);
        MarkActivity(gameId, game);
        CleanupInactiveGames();

        return (gameId, state);
    }
    
    public (string? gameId, Result<GameStateDto>? result) ToggleReady(string connectionId)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        Result<GameStateDto> result;
        lock (game)
        {
            result = game.ToggleReady(connectionId);
        }

        return (gameId, result);
    }

    public (string? gameId, Result<GameStateDto>? result) UpdateGameSettings(string connectionId, GameSettings settings)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        Result<GameStateDto> result;
        lock (game)
        {
            result = game.UpdateGameSettings(connectionId, settings);
        }

        return (gameId, result);
    }
    
    public (string? gameId, Result<GameStateDto>? result) StartGame(string connectionId)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        IEnumerable<string> existingMediaIds;
        Result<GameStateDto> result;
        lock (game)
        {
            existingMediaIds = GetSubmittedMediaIds(game).ToList();
            result = game.StartGame(connectionId);
            if (gameId != null && result.Success)
                _mediaStore.Remove(existingMediaIds);
        }

        return (gameId, result);
    }

    public (string? gameId, Result<GameStateDto>? result) SubmitPrompt(string connectionId, string text)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        Result<GameStateDto> result;
        lock (game)
        {
            result = game.SubmitPrompt(connectionId, text);
        }

        return (gameId, result);
    }

    public (string? gameId, Result<GameStateDto>? result) SavePromptDraft(
        string connectionId,
        string text,
        long clientDraftVersion)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        Result<GameStateDto> result;
        lock (game)
        {
            result = game.SavePromptDraft(connectionId, text, clientDraftVersion);
        }

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

        Result<GameStateDto> result;
        lock (game)
        {
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

            result = game.SubmitBribe(connectionId, request);

            if (!result.Success && request.Media != null)
                _mediaStore.Remove(request.Media.MediaId);
        }

        return (gameId, result);
    }

    public (string? gameId, Result<GameStateDto>? result) SaveBribeDraft(
        string connectionId,
        SaveBribeDraftRequest request)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        Result<GameStateDto> result;
        lock (game)
        {
            result = game.SaveBribeDraft(
                connectionId,
                request.TargetPlayerId,
                request.Text,
                request.Media,
                request.ClientDraftVersion);
        }

        return (gameId, result);
    }

    public (string? gameId, Result<GameStateDto>? result) SubmitVote(
        string connectionId,
        string bribeId)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        Result<GameStateDto> result;
        lock (game)
        {
            result = game.SubmitVote(connectionId, bribeId);
        }

        return (gameId, result);
    }

    public (string? gameId, Result<GameStateDto>? result) SaveVoteDraft(
        string connectionId,
        string bribeId,
        long clientDraftVersion)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        Result<GameStateDto> result;
        lock (game)
        {
            result = game.SaveVoteDraft(connectionId, bribeId, clientDraftVersion);
        }

        return (gameId, result);
    }

    public (string? gameId, Result<GameStateDto>? result) ToggleAppreciationCoin(
        string connectionId,
        string bribeId)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        Result<GameStateDto> result;
        lock (game)
        {
            result = game.ToggleAppreciationCoin(connectionId, bribeId);
        }

        return (gameId, result);
    }

    public (string? gameId, Result<GameStateDto>? result) SubmitAppreciationDone(string connectionId)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        Result<GameStateDto> result;
        lock (game)
        {
            result = game.SubmitAppreciationDone(connectionId);
        }

        return (gameId, result);
    }

    public (string? gameId, Result<GameStateDto>? result) StartNextRound(string connectionId)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        IEnumerable<string> existingMediaIds;
        Result<GameStateDto> result;
        lock (game)
        {
            existingMediaIds = GetSubmittedMediaIds(game).ToList();
            result = game.StartNextRound(connectionId);
            if (result.Success)
                _mediaStore.Remove(existingMediaIds);
        }

        return (gameId, result);
    }

    public (string? gameId, Result<GameStateDto>? result) AdvancePhaseWithoutOfflinePlayers(string connectionId)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        IEnumerable<string> beforeMediaIds;
        Result<GameStateDto> result;
        lock (game)
        {
            beforeMediaIds = GetSubmittedMediaIds(game).ToList();
            result = game.AdvancePhaseWithoutOfflinePlayers(connectionId);
            if (result.Success)
            {
                var remainingMediaIds = GetSubmittedMediaIds(game);
                _mediaStore.Remove(beforeMediaIds.Except(remainingMediaIds));
            }
        }

        return (gameId, result);
    }

    public List<ConnectionGameStateDto> GetConnectedPlayerStates(string gameId)
    {
        var game = GetGame(gameId);
        if (game == null) return [];
        lock (game)
        {
            return game.GetConnectedPlayerStates();
        }
    }

    public Result<BribeMedia> StoreMedia(
        string gameId,
        string playerId,
        string contentType,
        long byteSize,
        byte[] bytes)
    {
        CleanupInactiveGames();

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
        CleanupInactiveGames();
        return _mediaStore.Get(mediaId);
    }

    public List<string> ExpireDuePhases(DateTimeOffset? now = null)
    {
        var currentTime = now ?? _now();
        var changedGameIds = new List<string>();

        foreach (var pair in _games.ToList())
        {
            var game = pair.Value.Game;
            lock (game)
            {
                if (game.ExpireCurrentPhaseIfDue(currentTime))
                    changedGameIds.Add(pair.Key);
            }
        }

        return changedGameIds;
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
        _games.TryGetValue(NormalizeGameId(gameId), out var session);
        return session?.Game;
    }

    private void MarkActivity(string gameId, Game game)
    {
        if (!_games.TryGetValue(NormalizeGameId(gameId), out var session))
            return;

        session.EmptySince = game.State.Players.Any(player => player.Connected)
            ? null
            : _now();
    }

    private void CleanupInactiveGames()
    {
        var cutoff = _now() - InactiveRoomTtl;

        foreach (var session in _games
                     .Where(pair => pair.Value.EmptySince is { } emptySince && emptySince <= cutoff)
                     .ToList())
        {
            if (!_games.TryRemove(session.Key, out _))
                continue;

            _mediaStore.RemoveGameMedia(session.Key);

            foreach (var mapping in _connectionToGame
                         .Where(mapping => mapping.Value == session.Key)
                         .ToList())
            {
                _connectionToGame.TryRemove(mapping.Key, out _);
            }
        }
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

    private sealed class GameSession
    {
        public GameSession(Game game)
        {
            Game = game;
        }

        public Game Game { get; }
        public DateTimeOffset? EmptySince { get; set; }
    }
}
