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
    
    public (string? gameId, LobbyStateDto? state) Join(
        string gameId,
        string connectionId,
        string playerId,
        string name)
    {
        var game = GetGame(gameId);
        if (game == null) return (null, null);

        _connectionToGame[connectionId] = gameId;

        var state = game.Join(connectionId, playerId, name);

        return (gameId, state);
    }

    public (string? gameId, LobbyStateDto? state) Disconnect(string connectionId)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        var state = game.Disconnect(connectionId);

        return (gameId, state);
    }
    
    public (string? gameId, Result<LobbyStateDto>? result) ToggleReady(string connectionId)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        var result = game.ToggleReady(connectionId);

        return (gameId, result);
    }
    
    public (string? gameId, Result<LobbyStateDto>? result) StartGame(string connectionId)
    {
        var (gameId, game) = ResolveGame(connectionId);
        if (game == null) return (null, null);

        var result = game.StartGame(connectionId);

        return (gameId, result);
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
        _games.TryGetValue(gameId, out var game);
        return game;
    }

    private string GenerateGameId()
    {
        return new string(Enumerable.Range(0, 4)
            .Select(_ => _chars[_random.Next(_chars.Length)])
            .ToArray());
    }
}