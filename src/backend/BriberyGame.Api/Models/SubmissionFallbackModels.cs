namespace BriberyGame.Api.Models;

public enum BribeFallbackMode
{
    AutoFill,
    NoFallback
}

public enum BribeSubmissionOrigin
{
    Submitted,
    RandomFallback,
    Missing
}

public enum RoundResultOutcome
{
    SubmittedWinner,
    RandomFallbackWinner,
    NoWinner
}
