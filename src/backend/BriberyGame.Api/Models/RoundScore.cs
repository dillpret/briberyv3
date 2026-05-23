namespace BriberyGame.Api.Models;

public class RoundScore
{
    public string PlayerId { get; set; } = "";
    public int ChosenBribeCount { get; set; }
    public int ChosenBribePoints { get; set; }
    public int BonusCoinPoints { get; set; }
    public int TotalRoundPoints { get; set; }
    public double CumulativeScore { get; set; }
}
