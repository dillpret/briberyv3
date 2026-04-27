namespace BriberyGame.Api.Models;

public class PromptSubmission
{
    public string PlayerId { get; set; } = "";
    public string Text { get; set; } = "";
    public DateTimeOffset SubmittedAt { get; set; }
}
