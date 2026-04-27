namespace BriberyGame.Api.Models;

public class GameStateDto
{
    public List<Player> Players { get; set; } = new();
    public string? HostPlayerId { get; set; }
    public GamePhase Phase { get; set; }
    public int CurrentRound { get; set; }
    public int TotalRounds { get; set; }
    public int PromptSubmittedCount { get; set; }
    public int PromptRequiredCount { get; set; }
    public List<string> SubmittedPromptOwnerIds { get; set; } = new();
}
