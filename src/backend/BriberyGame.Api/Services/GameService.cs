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

    public GameState? GetGame(string gameId)
    {
        _games.TryGetValue(gameId, out var game);
        return game;
    }
    
    public LobbyStateDto Join(string gameId, string connectionId, string playerId, string name)
    {
        var game = GetGame(gameId);

        if (game == null)
            return null;

        if (game.Players.Any(p => p.ConnectionId == connectionId))
            return BuildState(game);

        var existing = game.Players.FirstOrDefault(p => p.Id == playerId);

        if (existing != null)
        {
            existing.ConnectionId = connectionId;
            existing.Connected = true;
            return BuildState(game);
        }

        var player = new Player
        {
            Id = playerId,
            Name = name,
            Connected = true,
            ConnectionId = connectionId
        };

        game.Players.Add(player);
        
        // Assign host if none exists
        if (game.HostPlayerId == null)
        {
            game.HostPlayerId = player.Id;
        }

        return BuildState(game);
    }

    public (string? gameId, LobbyStateDto) Disconnect(string connectionId)
    {
        if (!_connectionToGame.TryGetValue(connectionId, out var gameId))
            return (null, null);

        var game = GetGame(gameId);

        var player = game.Players.FirstOrDefault(p => p.ConnectionId == connectionId);

        if (player != null)
        {
            player.Connected = false;
        }
        
        if (player != null && player.Id == game.HostPlayerId)
        {
            var nextHost = game.Players.FirstOrDefault(p => p.Connected);

            game.HostPlayerId = nextHost?.Id;
        }

        return (gameId, BuildState(game));
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
    
    private LobbyStateDto BuildState(GameState game)
    {
        return new LobbyStateDto
        {
            Players = game.Players,
            HostPlayerId = game.HostPlayerId
        };
    }
}