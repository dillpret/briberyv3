namespace BriberyGame.Api.Models;

public class SubmitBribeRequest
{
    public string TargetPlayerId { get; set; } = "";
    public string? Text { get; set; }
    public BribeMedia? Media { get; set; }
}
