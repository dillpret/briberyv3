namespace BriberyGame.Api.Tests;

using BriberyGame.Api.Models;

public class RoundProgressionTests
{
    [Fact]
    public void OnlyHostCanStartNextRoundFromResults()
    {
        var harness = new GameTestHarness();
        harness.CompleteRoundToResults();

        var nonHostResult = harness.Game.StartNextRound("c2");
        var hostResult = harness.Game.StartNextRound("c1");

        Assert.False(nonHostResult.Success);
        Assert.True(hostResult.Success, hostResult.Error);
        Assert.Equal(GamePhase.Prompt, harness.Game.State.Phase);
        Assert.Equal(2, harness.Game.State.CurrentRound);
    }

    [Fact]
    public void NextRoundKeepsScoresAndClearsRoundLocalState()
    {
        var harness = new GameTestHarness();
        harness.CompleteRoundToResults();
        var scoreTotalAfterRoundOne = harness.GetPlayerState("p1").Players.Sum(player => player.Score);

        var result = harness.Game.StartNextRound("c1");

        Assert.True(result.Success, result.Error);
        Assert.Equal(scoreTotalAfterRoundOne, result.Data!.Players.Sum(player => player.Score));
        Assert.Equal(2, result.Data.CurrentRound);
        Assert.Equal(GamePhase.Prompt, result.Data.Phase);
        Assert.Empty(harness.Game.State.Prompts);
        Assert.Empty(harness.Game.State.TargetAssignments);
        Assert.Empty(harness.Game.State.Bribes);
        Assert.Empty(harness.Game.State.Votes);
        Assert.Empty(harness.Game.State.RoundResults);

        // WIP vs briefing: configured total rounds and a Finished phase are not yet
        // implemented, so the host can continue starting rounds indefinitely.
    }

    [Fact]
    public void ScoreboardIsCumulativeAcrossRounds()
    {
        var harness = new GameTestHarness();
        harness.CompleteRoundToResults();

        var firstRoundTotal = harness.GetPlayerState("p1").Players.Sum(player => player.Score);

        harness.Game.StartNextRound("c1");
        harness.SubmitPromptsForActivePlayers();
        harness.SubmitAllAssignedBribes();
        harness.SubmitAllVotes();

        var secondRoundTotal = harness.GetPlayerState("p1").Players.Sum(player => player.Score);

        Assert.Equal(3, firstRoundTotal);
        Assert.Equal(6, secondRoundTotal);
    }

    [Fact]
    public void NextRoundActivatesPlayersWhoJoinedDuringPreviousRound()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);
        harness.Game.Join("c4", "p4", "Late Player");
        harness.SubmitPromptsForActivePlayers();
        harness.SubmitAllAssignedBribes();
        harness.SubmitAllVotes();

        Assert.False(harness.Game.State.Players.Single(p => p.Id == "p4").IsActive);

        var result = harness.Game.StartNextRound("c1");

        Assert.True(result.Success, result.Error);
        Assert.True(harness.Game.State.Players.Single(p => p.Id == "p4").IsActive);
        Assert.True(harness.GetPlayerState("p4").IsCurrentPlayerActive);
    }
}
