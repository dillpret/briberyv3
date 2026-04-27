namespace BriberyGame.Api.Models;

public class RoundResult
{
    public string PromptOwnerPlayerId { get; set; } = "";
    public string PromptText { get; set; } = "";
    public string WinningBribeId { get; set; } = "";
    public string WinningBribeText { get; set; } = "";
    public string WinningPlayerId { get; set; } = "";
}
