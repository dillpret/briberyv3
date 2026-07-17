namespace BriberyGame.Api.Models;

public class GameSettings
{
    public PhaseTimerSettings PromptTimer { get; set; } = new() { DurationSeconds = 120 };
    public PhaseTimerSettings SubmissionTimer { get; set; } = new() { DurationSeconds = 300 };
    public PhaseTimerSettings VotingTimer { get; set; } = new() { DurationSeconds = 90 };
    public PhaseTimerSettings AppreciationTimer { get; set; } = new() { DurationSeconds = 120 };

    public PhaseTimerSettings TimerFor(GamePhase phase)
    {
        return phase switch
        {
            GamePhase.Prompt => PromptTimer,
            GamePhase.Submission => SubmissionTimer,
            GamePhase.Voting => VotingTimer,
            GamePhase.Appreciation => AppreciationTimer,
            _ => new PhaseTimerSettings()
        };
    }

    public GameSettings Clone()
    {
        return new GameSettings
        {
            PromptTimer = PromptTimer.Clone(),
            SubmissionTimer = SubmissionTimer.Clone(),
            VotingTimer = VotingTimer.Clone(),
            AppreciationTimer = AppreciationTimer.Clone()
        };
    }
}

public class PhaseTimerSettings
{
    public bool Enabled { get; set; }
    public int DurationSeconds { get; set; }

    public PhaseTimerSettings Clone()
    {
        return new PhaseTimerSettings
        {
            Enabled = Enabled,
            DurationSeconds = DurationSeconds
        };
    }
}
