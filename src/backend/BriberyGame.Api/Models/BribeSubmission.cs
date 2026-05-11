namespace BriberyGame.Api.Models;

public class BribeSubmission
{
    public string Id { get; set; } = "";
    public string FromPlayerId { get; set; } = "";
    public string ToPlayerId { get; set; } = "";
    public BribeContentKind Kind { get; set; } = BribeContentKind.Text;
    public string Text { get; set; } = "";
    public BribeMedia? Media { get; set; }
    public DateTimeOffset SubmittedAt { get; set; }
}
