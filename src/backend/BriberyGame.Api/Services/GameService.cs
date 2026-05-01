namespace BriberyGame.Api.Services;

using System.Collections.Concurrent;
using BriberyGame.Api.Models;

public class GameService
{
    private readonly ConcurrentDictionary<string, string> _connectionToGame = new();
    private readonly ConcurrentDictionary<string, Game> _games = new();
    
    private static readonly char[] _chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".ToCharArray();

    private readonly Random _random = new();
    
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
    
    public (string? gameId, GameStateDto? state) Join(
        string gameId,
        string connectionId,
        string playerId,
        string name)
    {
        var normalizedGameId = NormalizeGameId(gameId);
        var game = GetGame(normalizedGameId);
        if (game == null) return (null, null);

        _connectionToGame[connectionId] = normalizedGameId;

        var state = game.Join(connectionId, playerId, name);

        return (normalizedGameId, state);
    }

    public (string? gameId, GameStateDto? state) Disconnect(string connectionId)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        var state = game.Disconnect(connectionId);

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

        var result = game.StartGame(connectionId);

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
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        var result = game.SubmitBribe(connectionId, targetPlayerId, text);

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

        var result = game.StartNextRound(connectionId);

        return (gameId, result);
    }

    public List<ConnectionGameStateDto> GetConnectedPlayerStates(string gameId)
    {
        var game = GetGame(gameId);
        return game?.GetConnectedPlayerStates() ?? [];
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
}
