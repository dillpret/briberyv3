namespace BriberyGame.Api.Models;

public class GameStateDto
{
    public List<PlayerDto> Players { get; set; } = new();
    public string CurrentPlayerId { get; set; } = "";
    public string? HostPlayerId { get; set; }
    public GamePhase Phase { get; set; }
    public int CurrentRound { get; set; }
    public int TotalRounds { get; set; }
    public bool IsCurrentPlayerActive { get; set; }
    public int PromptSubmittedCount { get; set; }
    public int PromptRequiredCount { get; set; }
    public int BribeSubmittedCount { get; set; }
    public int BribeRequiredCount { get; set; }
    public int VoteSubmittedCount { get; set; }
    public int VoteRequiredCount { get; set; }
    public bool CanHostAdvanceWithoutOfflinePlayers { get; set; }
    public List<string> OfflineBlockingPlayerNames { get; set; } = new();
    public string? AdvanceWithoutOfflinePlayersBlockedReason { get; set; }
    public PromptPhaseDto? Prompt { get; set; }
    public SubmissionPhaseDto? Submission { get; set; }
    public VotingPhaseDto? Voting { get; set; }
    public ResultsPhaseDto? Results { get; set; }
}

public class PlayerDto
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public bool Connected { get; set; }
    public bool IsReady { get; set; }
    public bool IsActive { get; set; }
    public double Score { get; set; }
    public PlayerPhaseStatus PhaseStatus { get; set; }
    public string PhaseStatusLabel { get; set; } = "";
}

public class PromptPhaseDto
{
    public bool HasSubmittedPrompt { get; set; }
}

public class SubmissionPhaseDto
{
    public List<SubmissionTargetDto> Targets { get; set; } = new();
    public List<string> SubmittedTargetPlayerIds { get; set; } = new();
}

public class SubmissionTargetDto
{
    public string PlayerId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Prompt { get; set; } = "";
}

public class VotingPhaseDto
{
    public List<VotingBribeDto> Bribes { get; set; } = new();
    public string? SelectedBribeId { get; set; }
}

public class VotingBribeDto
{
    public string BribeId { get; set; } = "";
    public BribeContentKind Kind { get; set; } = BribeContentKind.Text;
    public string Text { get; set; } = "";
    public BribeMedia? Media { get; set; }
}

public class ResultsPhaseDto
{
    public List<RoundResultDto> RoundResults { get; set; } = new();
}

public class RoundResultDto
{
    public string PromptOwnerPlayerId { get; set; } = "";
    public string PromptOwnerName { get; set; } = "";
    public string PromptText { get; set; } = "";
    public BribeContentKind WinningBribeKind { get; set; } = BribeContentKind.Text;
    public string WinningBribeText { get; set; } = "";
    public BribeMedia? WinningBribeMedia { get; set; }
    public string WinningPlayerId { get; set; } = "";
    public string WinningPlayerName { get; set; } = "";
}
