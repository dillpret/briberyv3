namespace BriberyGame.Api.Services;

using System.Collections.Concurrent;
using BriberyGame.Api.Models;

public class GameService
{
    private readonly ConcurrentDictionary<string, GameState> _games = new();

    // For now: single lobby (we'll expand later)
    private const string DefaultGameId = "LOBBY";

    public GameState GetGame()
    {
        return _games.GetOrAdd(DefaultGameId, id => new GameState
        {
            GameId = id
        });
    }

    public List<Player> Join(string connectionId, string playerId, string name)
    {
        var game = GetGame();
        
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

    public List<Player> Disconnect(string connectionId)
    {
        var game = GetGame();

        var player = game.Players.FirstOrDefault(p => p.ConnectionId == connectionId);

        if (player != null)
        {
            player.Connected = false;
        }

        return game.Players;
    }
}