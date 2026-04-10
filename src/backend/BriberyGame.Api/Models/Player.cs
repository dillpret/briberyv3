namespace BriberyGame.Api.Models;

public class Player
{
    public string Id { get; set; } = "";           // persistent playerId
    public string Name { get; set; } = "";
    public bool Connected { get; set; }
    public string ConnectionId { get; set; } = ""; // current connection
    public bool IsReady { get; set; }
}