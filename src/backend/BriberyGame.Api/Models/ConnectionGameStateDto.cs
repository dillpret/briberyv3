namespace BriberyGame.Api.Models;

public class ConnectionGameStateDto
{
    public string ConnectionId { get; set; } = "";
    public GameStateDto State { get; set; } = new();
}
