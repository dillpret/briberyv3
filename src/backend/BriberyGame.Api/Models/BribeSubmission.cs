namespace BriberyGame.Api.Models;

public class BribeSubmission
{
    public string Id { get; set; } = "";
    public string FromPlayerId { get; set; } = "";
    public string ToPlayerId { get; set; } = "";
    public string Text { get; set; } = "";
    public DateTimeOffset SubmittedAt { get; set; }
}
