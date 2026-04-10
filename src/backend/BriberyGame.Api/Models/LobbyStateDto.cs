namespace BriberyGame.Api.Models;

public class LobbyStateDto
{
    public List<Player> Players { get; set; } = new();
    public string? HostPlayerId { get; set; }
    public GamePhase Phase { get; set; }
}