namespace BriberyGame.Api.Models;

public class GameState
{
    public string GameId { get; set; } = "";
    public List<Player> Players { get; set; } = new();
    public string? HostPlayerId { get; set; }
    public GamePhase Phase { get; set; } = GamePhase.Lobby;
    public int CurrentRound { get; set; }
    public int TotalRounds { get; set; } = 1;
    public Dictionary<string, PromptSubmission> Prompts { get; set; } = new();
    public Dictionary<string, List<string>> TargetAssignments { get; set; } = new();
    public Dictionary<string, BribeSubmission> Bribes { get; set; } = new();
    public Dictionary<string, VoteSubmission> Votes { get; set; } = new();
    public List<RoundResult> RoundResults { get; set; } = new();
}
