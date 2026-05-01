namespace BriberyGame.Api.Tests;

using BriberyGame.Api.Models;

public class PlayerPhaseStatusTests
{
    [Fact]
    public void LobbyStatusShowsReadyAndPendingPlayers()
    {
        var harness = new GameTestHarness();
        harness.JoinPlayers(3);
        harness.Game.ToggleReady("c1");

        var state = harness.GetPlayerState("p1");

        Assert.Equal(PlayerPhaseStatus.Ready, state.Players.Single(p => p.Id == "p1").PhaseStatus);
        Assert.Equal("Ready", state.Players.Single(p => p.Id == "p1").PhaseStatusLabel);
        Assert.Equal(PlayerPhaseStatus.Pending, state.Players.Single(p => p.Id == "p2").PhaseStatus);
        Assert.Equal("Not ready", state.Players.Single(p => p.Id == "p2").PhaseStatusLabel);
    }

    [Fact]
    public void PromptStatusChangesFromPendingToDoneAfterSubmission()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);

        var before = harness.GetPlayerState("p1");
        Assert.Equal(PlayerPhaseStatus.Pending, before.Players.Single(p => p.Id == "p1").PhaseStatus);
        Assert.Equal("Needs prompt", before.Players.Single(p => p.Id == "p1").PhaseStatusLabel);

        harness.Game.SubmitPrompt("c1", "A prompt");
        var after = harness.GetPlayerState("p1");

        Assert.Equal(PlayerPhaseStatus.Done, after.Players.Single(p => p.Id == "p1").PhaseStatus);
        Assert.Equal("Submitted", after.Players.Single(p => p.Id == "p1").PhaseStatusLabel);
    }

    [Fact]
    public void SubmissionStatusChangesFromPendingToDoneAfterAllAssignedBribes()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);
        harness.SubmitPromptsForActivePlayers();

        var before = harness.GetPlayerState("p1");
        Assert.Equal(PlayerPhaseStatus.Pending, before.Players.Single(p => p.Id == "p1").PhaseStatus);
        Assert.Equal("Needs bribes", before.Players.Single(p => p.Id == "p1").PhaseStatusLabel);

        foreach (var target in before.Submission!.Targets)
        {
            harness.Game.SubmitBribe("c1", target.PlayerId, $"Bribe for {target.PlayerId}");
        }

        var after = harness.GetPlayerState("p1");
        Assert.Equal(PlayerPhaseStatus.Done, after.Players.Single(p => p.Id == "p1").PhaseStatus);
        Assert.Equal("Submitted", after.Players.Single(p => p.Id == "p1").PhaseStatusLabel);
    }

    [Fact]
    public void VotingStatusChangesFromPendingToDoneAfterVote()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);
        harness.SubmitPromptsForActivePlayers();
        harness.SubmitAllAssignedBribes();

        var before = harness.GetPlayerState("p1");
        Assert.Equal(PlayerPhaseStatus.Pending, before.Players.Single(p => p.Id == "p1").PhaseStatus);
        Assert.Equal("Needs vote", before.Players.Single(p => p.Id == "p1").PhaseStatusLabel);

        harness.Game.SubmitVote("c1", before.Voting!.Bribes[0].BribeId);
        var after = harness.GetPlayerState("p1");

        Assert.Equal(PlayerPhaseStatus.Done, after.Players.Single(p => p.Id == "p1").PhaseStatus);
        Assert.Equal("Voted", after.Players.Single(p => p.Id == "p1").PhaseStatusLabel);
    }

    [Fact]
    public void InactiveLateJoinerStatusIsWaiting()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);

        var state = harness.Game.Join("c4", "p4", "Late Player");

        Assert.Equal(PlayerPhaseStatus.Waiting, state.Players.Single(p => p.Id == "p4").PhaseStatus);
        Assert.Equal("Waiting next round", state.Players.Single(p => p.Id == "p4").PhaseStatusLabel);
    }

    [Fact]
    public void DisconnectedPlayersShowOfflineStatusWithoutBeingRemoved()
    {
        var harness = new GameTestHarness();
        harness.JoinPlayers(3);

        var state = harness.Game.Disconnect("c2");

        Assert.Equal(3, state.Players.Count);
        Assert.Equal(PlayerPhaseStatus.None, state.Players.Single(p => p.Id == "p2").PhaseStatus);
        Assert.Equal("Offline", state.Players.Single(p => p.Id == "p2").PhaseStatusLabel);
    }

    [Fact]
    public void ResultsStatusIsDoneForActivePlayers()
    {
        var harness = new GameTestHarness();
        harness.CompleteRoundToResults();

        var state = harness.GetPlayerState("p1");

        Assert.All(state.Players.Where(p => p.IsActive), player =>
        {
            Assert.Equal(PlayerPhaseStatus.Done, player.PhaseStatus);
            Assert.Equal("Done", player.PhaseStatusLabel);
        });
    }
}
