namespace BriberyGame.Api.Services;

using System.Collections.Concurrent;
using BriberyGame.Api.Models;

public class GameService
{
    private readonly ConcurrentDictionary<string, GameState> _games = new();
    private readonly ConcurrentDictionary<string, string> _connectionToGame = new();
    
    private static readonly char[] _chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".ToCharArray();

    private readonly Random _random = new();

    public GameState GetGame(string gameId)
    {
        return _games.GetOrAdd(gameId, id => new GameState
        {
            GameId = id
        });
    }

    public List<Player> Join(string gameId, string connectionId, string playerId, string name)
    {
        var game = GetGame(gameId);
        _connectionToGame[connectionId] = gameId;
        
        // If this connection already has a player, reject
        if (game.Players.Any(p => p.ConnectionId == connectionId))
        {
            return game.Players;
        }

        var existing = game.Players.FirstOrDefault(p => p.Id == playerId);

        if (existing != null)
        {
            existing.ConnectionId = connectionId;
            existing.Connected = true;
            return game.Players;
        }

        var player = new Player
        {
            Id = playerId,
            Name = name,
            Connected = true,
            ConnectionId = connectionId
        };

        game.Players.Add(player);

        return game.Players;
    }

    public (string? gameId, List<Player>? players) Disconnect(string connectionId)
    {
        if (!_connectionToGame.TryGetValue(connectionId, out var gameId))
            return (null, null);

        var game = GetGame(gameId);

        var player = game.Players.FirstOrDefault(p => p.ConnectionId == connectionId);

        if (player != null)
        {
            player.Connected = false;
        }

        return (gameId, game.Players);
    }
    
    public string CreateGame()
    {
        string gameId;

        do
        {
            gameId = GenerateGameId();
        }
        while (_games.ContainsKey(gameId));

        _games[gameId] = new GameState
        {
            GameId = gameId
        };

        return gameId;
    }

    private string GenerateGameId()
    {
        return new string(Enumerable.Range(0, 4)
            .Select(_ => _chars[_random.Next(_chars.Length)])
            .ToArray());
    }
 
}