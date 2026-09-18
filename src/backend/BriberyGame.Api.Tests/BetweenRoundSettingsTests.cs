namespace BriberyGame.Api.Tests;

using BriberyGame.Api.Models;

public class BetweenRoundSettingsTests
{
    [Fact]
    public void HostCanUpdateAllSettingsOnScoreboardAndNextRoundUsesThem()
    {
        var harness = new GameTestHarness();
        harness.CompleteRoundToScoreboard(4);
        var settings = harness.Game.State.Settings.Clone();
        settings.PromptsAnsweredPerPlayer = 3;
        settings.BribeFallbackMode = BribeFallbackMode.NoFallback;
        settings.PromptTimer = new PhaseTimerSettings { Enabled = true, DurationSeconds = 45 };
        settings.SubmissionTimer = new PhaseTimerSettings { Enabled = true, DurationSeconds = 60 };
        settings.VotingTimer = new PhaseTimerSettings { Enabled = true, DurationSeconds = 75 };
        settings.AppreciationTimer = new PhaseTimerSettings { Enabled = true, DurationSeconds = 90 };

        var updated = harness.Game.UpdateGameSettings("c1", settings);
        var started = harness.Game.StartNextRound("c1");

        Assert.True(updated.Success, updated.Error);
        Assert.True(started.Success, started.Error);
        Assert.Equal(2, started.Data!.CurrentRound);
        Assert.Equal(3, started.Data.Settings.PromptsAnsweredPerPlayer);
        Assert.Equal(BribeFallbackMode.NoFallback, started.Data.Settings.BribeFallbackMode);
        Assert.True(started.Data.TimerEnabled);
        Assert.Equal(45, started.Data.PhaseDurationSeconds);

        harness.SubmitPromptsForActivePlayers();
        Assert.All(harness.Game.State.TargetAssignments.Values, targets => Assert.Equal(3, targets.Count));
    }

    [Fact]
    public void NonHostAndInvalidScoreboardUpdatesAreRejectedWithoutChangingSettings()
    {
        var harness = new GameTestHarness();
        harness.CompleteRoundToScoreboard();
        var original = harness.Game.State.Settings;
        var changed = original.Clone();
        changed.PromptTimer.DurationSeconds = 601;

        var nonHost = harness.Game.UpdateGameSettings("c2", original.Clone());
        var invalid = harness.Game.UpdateGameSettings("c1", changed);

        Assert.False(nonHost.Success);
        Assert.False(invalid.Success);
        Assert.Same(original, harness.Game.State.Settings);
    }

    [Theory]
    [InlineData(GamePhase.Prompt)]
    [InlineData(GamePhase.Submission)]
    [InlineData(GamePhase.Voting)]
    [InlineData(GamePhase.Appreciation)]
    public void SettingsCannotBeUpdatedDuringActiveRound(GamePhase phase)
    {
        var harness = new GameTestHarness();
        MoveToPhase(harness, phase);
        var settings = harness.Game.State.Settings.Clone();
        settings.PromptTimer.Enabled = true;

        var result = harness.Game.UpdateGameSettings("c1", settings);

        Assert.False(result.Success);
        Assert.Contains("active round", result.Error);
        Assert.False(harness.Game.State.Settings.PromptTimer.Enabled);
    }

    [Fact]
    public void RaisingAndLoweringPromptCountImmediatelyChangesNextRoundEligibility()
    {
        var harness = new GameTestHarness();
        harness.CompleteRoundToScoreboard(4);
        var settings = harness.Game.State.Settings.Clone();
        settings.PromptsAnsweredPerPlayer = 4;
        Assert.True(harness.Game.UpdateGameSettings("c1", settings).Success);

        var blocked = harness.Game.StartNextRound("c1");
        Assert.False(blocked.Success);
        Assert.Contains("at least 5", blocked.Error);

        settings.PromptsAnsweredPerPlayer = 3;
        Assert.True(harness.Game.UpdateGameSettings("c1", settings).Success);
        var started = harness.Game.StartNextRound("c1");

        Assert.True(started.Success, started.Error);
        Assert.Equal(GamePhase.Prompt, started.Data!.Phase);
    }

    [Fact]
    public void ConnectedWaitingPlayersCountForNextRoundWhileDisconnectedPlayersRemainInactive()
    {
        var harness = new GameTestHarness();
        harness.CompleteRoundToScoreboard();
        harness.JoinPlayer("c4", "p4", "Waiting Player");
        harness.JoinPlayer("c5", "p5", "Offline Waiting Player");
        harness.Game.Disconnect("c5");
        var settings = harness.Game.State.Settings.Clone();
        settings.PromptsAnsweredPerPlayer = 3;
        Assert.True(harness.Game.UpdateGameSettings("c1", settings).Success);

        var result = harness.Game.StartNextRound("c1");

        Assert.True(result.Success, result.Error);
        Assert.True(result.Data!.Players.Single(player => player.Id == "p4").IsActive);
        Assert.False(result.Data.Players.Single(player => player.Id == "p5").IsActive);
    }

    [Fact]
    public void ReassignedHostCanChangeSettingsAndStartTheNextRound()
    {
        var harness = new GameTestHarness();
        harness.CompleteRoundToScoreboard(4);
        harness.Game.Disconnect("c1");
        var settings = harness.Game.State.Settings.Clone();
        settings.PromptsAnsweredPerPlayer = 2;

        var updated = harness.Game.UpdateGameSettings("c2", settings);
        var started = harness.Game.StartNextRound("c2");

        Assert.True(updated.Success, updated.Error);
        Assert.True(started.Success, started.Error);
        Assert.Equal("p2", started.Data!.HostPlayerId);
        Assert.False(started.Data.Players.Single(player => player.Id == "p1").IsActive);
    }

    private static void MoveToPhase(GameTestHarness harness, GamePhase phase)
    {
        harness.StartPromptPhaseWithPlayers(3);
        if (phase == GamePhase.Prompt) return;

        harness.SubmitPromptsForActivePlayers();
        if (phase == GamePhase.Submission) return;

        harness.SubmitAllAssignedBribes();
        if (phase == GamePhase.Voting) return;

        harness.SubmitAllVotes();
        Assert.Equal(GamePhase.Appreciation, harness.Game.State.Phase);
    }
}
