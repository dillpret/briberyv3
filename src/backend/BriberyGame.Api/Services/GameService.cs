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

    public List<Player> Join(string connectionId, string name)
    {
        var game = GetGame();

        // Prevent duplicate joins
        if (game.Players.Any(p => p.Id == connectionId))
            return game.Players;

        var player = new Player
        {
            Id = connectionId,
            Name = name,
            Connected = true
        };

        game.Players.Add(player);

        return game.Players;
    }

    public List<Player> Disconnect(string connectionId)
    {
        var game = GetGame();

        var player = game.Players.FirstOrDefault(p => p.Id == connectionId);

        if (player != null)
        {
            player.Connected = false;
        }

        return game.Players;
    }
}