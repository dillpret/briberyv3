namespace BriberyGame.Api.Tests;

using BriberyGame.Api.Models;

public class OfflinePlayerAdvanceTests
{
    [Fact]
    public void HostCanAdvancePromptWithoutOfflineBlockingPlayer()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(4);

        harness.Game.SubmitPrompt("c1", "Prompt 1");
        harness.Game.SubmitPrompt("c2", "Prompt 2");
        harness.Game.SubmitPrompt("c3", "Prompt 3");
        harness.Game.Disconnect("c4");

        var blockedState = harness.GetPlayerState("p1");
        Assert.Equal(GamePhase.Prompt, blockedState.Phase);
        Assert.True(blockedState.CanHostAdvanceWithoutOfflinePlayers);
        Assert.Equal(["Player 4"], blockedState.OfflineBlockingPlayerNames);

        var result = harness.Game.AdvancePhaseWithoutOfflinePlayers("c1");

        Assert.True(result.Success, result.Error);
        Assert.Equal(GamePhase.Submission, result.Data!.Phase);
        Assert.False(result.Data.Players.Single(p => p.Id == "p4").IsActive);
        Assert.Contains(result.Data.Players, p => p.Id == "p4" && !p.Connected);
    }

    [Fact]
    public void AdvanceWithoutOfflinePlayersIsBlockedWhenTooFewActiveConnectedPlayersRemain()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);

        harness.Game.SubmitPrompt("c1", "Prompt 1");
        harness.Game.SubmitPrompt("c2", "Prompt 2");
        harness.Game.Disconnect("c3");

        var state = harness.GetPlayerState("p1");
        Assert.False(state.CanHostAdvanceWithoutOfflinePlayers);
        Assert.NotNull(state.AdvanceWithoutOfflinePlayersBlockedReason);

        var result = harness.Game.AdvancePhaseWithoutOfflinePlayers("c1");

        Assert.False(result.Success);
        Assert.Equal(GamePhase.Prompt, harness.Game.State.Phase);
        Assert.True(harness.Game.State.Players.Single(p => p.Id == "p3").IsActive);
    }

    [Fact]
    public void NonHostCannotAdvanceWithoutOfflinePlayers()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(4);
        harness.Game.Disconnect("c4");

        var result = harness.Game.AdvancePhaseWithoutOfflinePlayers("c2");

        Assert.False(result.Success);
        Assert.Equal(GamePhase.Prompt, harness.Game.State.Phase);
    }

    [Fact]
    public void HostCanAdvanceSubmissionAfterOfflinePlayerDataIsRemoved()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(4);
        harness.SubmitPromptsForActivePlayers();

        SubmitBribesExceptTargets(harness, "p4");
        harness.Game.Disconnect("c4");

        var result = harness.Game.AdvancePhaseWithoutOfflinePlayers("c1");

        Assert.True(result.Success, result.Error);
        Assert.Equal(GamePhase.Voting, result.Data!.Phase);
        Assert.False(result.Data.Players.Single(p => p.Id == "p4").IsActive);
        Assert.DoesNotContain(harness.Game.State.Bribes.Values, b => b.FromPlayerId == "p4" || b.ToPlayerId == "p4");
        Assert.DoesNotContain(harness.Game.State.TargetAssignments, a => a.Key == "p4");
        Assert.All(harness.Game.State.TargetAssignments.Values, targets => Assert.DoesNotContain("p4", targets));
    }

    [Fact]
    public void HostCanAdvanceVotingAndScoreOnlyRemainingValidVotes()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(4);
        harness.SubmitPromptsForActivePlayers();
        harness.SubmitAllAssignedBribes();

        SubmitVoteForBribeFrom(harness, "p1", "p3");
        SubmitVoteForBribeFrom(harness, "p2", "p1");
        SubmitVoteForBribeFrom(harness, "p3", "p1");
        harness.Game.Disconnect("c4");

        var result = harness.Game.AdvancePhaseWithoutOfflinePlayers("c1");

        Assert.True(result.Success, result.Error);
        Assert.Equal(GamePhase.Results, result.Data!.Phase);
        Assert.Equal(3, result.Data.Results!.RoundResults.Count);
        Assert.Equal(3, result.Data.Players.Sum(p => p.Score));
        Assert.Equal(0, result.Data.Players.Single(p => p.Id == "p4").Score);
    }

    [Fact]
    public void SkippedPlayerReconnectsInactiveUntilNextRoundAndThenBecomesActiveIfConnected()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(4);
        harness.Game.SubmitPrompt("c1", "Prompt 1");
        harness.Game.SubmitPrompt("c2", "Prompt 2");
        harness.Game.SubmitPrompt("c3", "Prompt 3");
        harness.Game.Disconnect("c4");
        harness.Game.AdvancePhaseWithoutOfflinePlayers("c1");

        var reconnectState = harness.Game.Join("c4-reconnected", "p4", "Player 4");

        Assert.False(reconnectState.IsCurrentPlayerActive);
        Assert.False(reconnectState.Players.Single(p => p.Id == "p4").IsActive);
        Assert.True(reconnectState.Players.Single(p => p.Id == "p4").Connected);

        harness.SubmitAllAssignedBribes();
        harness.SubmitAllVotes();
        var nextRound = harness.Game.StartNextRound("c1");

        Assert.True(nextRound.Success, nextRound.Error);
        Assert.True(nextRound.Data!.Players.Single(p => p.Id == "p4").IsActive);
    }

    [Fact]
    public void OfflinePlayersStayInactiveWhenNextRoundStartsUntilTheyReconnect()
    {
        var harness = new GameTestHarness();
        harness.CompleteRoundToResults(4);
        harness.Game.Disconnect("c4");

        var result = harness.Game.StartNextRound("c1");

        Assert.True(result.Success, result.Error);
        Assert.False(result.Data!.Players.Single(p => p.Id == "p4").IsActive);
    }

    [Fact]
    public void NextRoundCannotStartWithFewerThanThreeConnectedPlayers()
    {
        var harness = new GameTestHarness();
        harness.CompleteRoundToResults(3);
        harness.Game.Disconnect("c3");

        var result = harness.Game.StartNextRound("c1");

        Assert.False(result.Success);
        Assert.Equal(GamePhase.Results, harness.Game.State.Phase);
    }

    private static void SubmitBribesExceptTargets(GameTestHarness harness, string excludedTargetPlayerId)
    {
        foreach (var player in harness.ActivePlayers().Where(p => p.Id != excludedTargetPlayerId))
        {
            var state = harness.GetPlayerState(player.Id);

            foreach (var target in state.Submission!.Targets.Where(t => t.PlayerId != excludedTargetPlayerId))
            {
                var result = harness.Game.SubmitBribe(
                    player.ConnectionId,
                    target.PlayerId,
                    $"Bribe from {player.Id} to {target.PlayerId}");

                Assert.True(result.Success, result.Error);
            }
        }
    }

    private static void SubmitVoteForBribeFrom(GameTestHarness harness, string voterPlayerId, string fromPlayerId)
    {
        var state = harness.GetPlayerState(voterPlayerId);
        var bribe = harness.Game.State.Bribes.Values.Single(b =>
            b.ToPlayerId == voterPlayerId &&
            b.FromPlayerId == fromPlayerId);

        var result = harness.Game.SubmitVote(
            harness.Game.State.Players.Single(p => p.Id == voterPlayerId).ConnectionId,
            bribe.Id);

        Assert.True(result.Success, result.Error);
        Assert.Contains(state.Voting!.Bribes, b => b.BribeId == bribe.Id);
    }
}
