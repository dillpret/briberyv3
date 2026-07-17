namespace BriberyGame.Api.Models;

public class GameState
{
    public string GameId { get; set; } = "";
    public List<Player> Players { get; set; } = new();
    public string? HostPlayerId { get; set; }
    public GamePhase Phase { get; set; } = GamePhase.Lobby;
    public int CurrentRound { get; set; }
    public int NextJoinOrder { get; set; }
    public GameSettings Settings { get; set; } = new();
    public DateTimeOffset? PhaseStartedAtUtc { get; set; }
    public DateTimeOffset? PhaseEndsAtUtc { get; set; }
    public int PhaseRevision { get; set; }
    public Dictionary<string, PromptSubmission> Prompts { get; set; } = new();
    public Dictionary<string, List<string>> TargetAssignments { get; set; } = new();
    public Dictionary<string, BribeSubmission> Bribes { get; set; } = new();
    public Dictionary<string, VoteSubmission> Votes { get; set; } = new();
    public Dictionary<string, TextDraft> PromptDrafts { get; set; } = new();
    public Dictionary<string, BribeDraft> BribeDrafts { get; set; } = new();
    public Dictionary<string, VoteDraft> VoteDrafts { get; set; } = new();
    public Dictionary<string, HashSet<string>> AppreciationCoins { get; set; } = new();
    public HashSet<string> AppreciationDonePlayerIds { get; set; } = new();
    public List<RoundResult> RoundResults { get; set; } = new();
    public List<RoundScore> RoundScores { get; set; } = new();
}
