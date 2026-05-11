namespace BriberyGame.Api.Models;

public class RoundResult
{
    public string PromptOwnerPlayerId { get; set; } = "";
    public string PromptText { get; set; } = "";
    public string WinningBribeId { get; set; } = "";
    public BribeContentKind WinningBribeKind { get; set; } = BribeContentKind.Text;
    public string WinningBribeText { get; set; } = "";
    public BribeMedia? WinningBribeMedia { get; set; }
    public string WinningPlayerId { get; set; } = "";
}
