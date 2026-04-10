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
        _connectionToGame[connectionId] = gameId;

        if (game == null)
            return null;

        if (game.Players.Any(p => p.ConnectionId == connectionId))
            return BuildState(game);

        var existing = game.Players.FirstOrDefault(p => p.Id == playerId);

        if (existing != null)
        {
            existing.ConnectionId = connectionId;
            existing.Connected = true;
            existing.IsReady = false;
            return BuildState(game);
        }

        var player = new Player
        {
            Id = playerId,
            Name = name,
            Connected = true,
            ConnectionId = connectionId,
            IsReady = false
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
    
    public LobbyStateDto? ToggleReady(string connectionId)
    {
        if (!_connectionToGame.TryGetValue(connectionId, out var gameId))
            return null;

        var game = GetGame(gameId);
        if (game == null) return null;

        var player = game.Players.FirstOrDefault(p => p.ConnectionId == connectionId);
        if (player == null) return null;

        player.IsReady = !player.IsReady;

        return BuildState(game);
    }
    
    public (string? gameId, LobbyStateDto? state) ToggleReadyWithGame(string connectionId)
    {
        if (!_connectionToGame.TryGetValue(connectionId, out var gameId))
            return (null, null);

        var game = GetGame(gameId);
        if (game == null) return (null, null);

        var player = game.Players.FirstOrDefault(p => p.ConnectionId == connectionId);
        if (player == null) return (null, null);

        player.IsReady = !player.IsReady;

        return (gameId, BuildState(game));
    }
    
    public bool CanStartGame(GameState game)
    {
        return game.Players
            .Where(p => p.Connected)
            .All(p => p.IsReady);
    }
    
    public (bool success, LobbyStateDto? state)? StartGame(string connectionId)
    {
        if (!_connectionToGame.TryGetValue(connectionId, out var gameId))
            return null;

        var game = GetGame(gameId);
        if (game == null) return null;

        var player = game.Players.FirstOrDefault(p => p.ConnectionId == connectionId);
        if (player == null) return null;

        if (player.Id != game.HostPlayerId)
            return (false, BuildState(game));

        if (!CanStartGame(game))
            return (false, BuildState(game));

        // placeholder: game would transition state here
        return (true, BuildState(game));
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