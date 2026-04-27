namespace BriberyGame.Api.Models;

public enum GamePhase
{
    NotSet = 0,
    Lobby = 1,
    Prompt = 2,
    Submission = 3,
    Voting = 4,
    Results = 5
}
