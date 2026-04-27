namespace BriberyGame.Api.Models;

public class VoteSubmission
{
    public string VoterPlayerId { get; set; } = "";
    public string BribeId { get; set; } = "";
    public DateTimeOffset SubmittedAt { get; set; }
}
