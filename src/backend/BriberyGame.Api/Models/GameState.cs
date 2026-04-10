namespace BriberyGame.Api.Models;

public class GameState
{
    public string GameId { get; set; } = "";
    public List<Player> Players { get; set; } = new();
    public string? HostPlayerId { get; set; }
    public GamePhase Phase { get; set; } = GamePhase.Lobby;
}