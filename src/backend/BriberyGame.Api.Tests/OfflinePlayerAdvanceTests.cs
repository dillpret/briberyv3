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
        Assert.True(result.Data.Players.Single(p => p.Id == "p4").IsActive);
        Assert.Contains(result.Data.Players, p => p.Id == "p4" && !p.Connected);
        Assert.Equal(CompletionKind.Fallback, harness.Game.State.Prompts["p4"].CompletionKind);
        Assert.True(harness.Game.State.Prompts["p4"].CompletedWhileOffline);
        Assert.Contains(harness.Game.State.TargetAssignments.Values, targets => targets.Contains("p4"));
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
    public void HostCanAdvanceSubmissionAfterOfflinePlayerMissingBribesAreCompleted()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(4);
        harness.SubmitPromptsForActivePlayers();

        SubmitBribesExceptPlayer(harness, "p4");
        harness.Game.Disconnect("c4");

        var result = harness.Game.AdvancePhaseWithoutOfflinePlayers("c1");

        Assert.True(result.Success, result.Error);
        Assert.Equal(GamePhase.Voting, result.Data!.Phase);
        Assert.True(result.Data.Players.Single(p => p.Id == "p4").IsActive);
        Assert.Contains(harness.Game.State.Bribes.Values, b => b.FromPlayerId == "p4" && b.CompletedWhileOffline);
        Assert.Contains(harness.Game.State.Bribes.Values, b => b.ToPlayerId == "p4");
        Assert.Contains(harness.Game.State.TargetAssignments, a => a.Key == "p4");
        Assert.Contains(harness.Game.State.TargetAssignments.Values, targets => targets.Contains("p4"));
        Assert.All(
            harness.Game.State.TargetAssignments["p4"],
            targetId => Assert.Contains(harness.Game.State.Bribes.Values, b =>
                b.FromPlayerId == "p4" &&
                b.ToPlayerId == targetId &&
                b.CompletionKind == CompletionKind.Fallback &&
                b.CompletedWhileOffline));
    }

    [Fact]
    public void HostCanAdvanceVotingAndBuildResultsOnlyForRemainingValidVotes()
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
        Assert.Equal(GamePhase.Appreciation, result.Data!.Phase);
        Assert.Equal(4, result.Data.Appreciation!.RoundResults.Count);
        Assert.Contains(result.Data.Appreciation.RoundResults, result =>
            result.PromptOwnerPlayerId == "p4" ||
            result.WinningPlayerId == "p4" ||
            result.VoteCompletedWhileOffline);
        Assert.Equal(0, result.Data.Players.Sum(p => p.Score));
        Assert.Equal(0, result.Data.Players.Single(p => p.Id == "p4").Score);
    }

    [Fact]
    public void SkippedPlayerReconnectsActiveInCurrentRoundAfterMissingWorkIsCompleted()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(4);
        harness.Game.SubmitPrompt("c1", "Prompt 1");
        harness.Game.SubmitPrompt("c2", "Prompt 2");
        harness.Game.SubmitPrompt("c3", "Prompt 3");
        harness.Game.Disconnect("c4");
        harness.Game.AdvancePhaseWithoutOfflinePlayers("c1");

        var reconnectState = harness.JoinPlayer("c4-reconnected", "p4", "Player 4");

        Assert.True(reconnectState.IsCurrentPlayerActive);
        Assert.True(reconnectState.Players.Single(p => p.Id == "p4").IsActive);
        Assert.True(reconnectState.Players.Single(p => p.Id == "p4").Connected);
        var targetCardForP4 = harness.ActivePlayers()
            .Where(player => player.Id != "p4")
            .SelectMany(player => harness.GetPlayerState(player.Id).Submission!.Targets)
            .First(target => target.PlayerId == "p4");
        Assert.Equal(CompletionKind.Fallback, targetCardForP4.PromptCompletionKind);
        Assert.True(targetCardForP4.PromptCompletedWhileOffline);

        harness.SubmitAllAssignedBribes();
        harness.SubmitAllVotes();
        harness.SubmitAllAppreciationDone();
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
        Assert.Equal(GamePhase.Scoreboard, harness.Game.State.Phase);
    }

    [Fact]
    public void HostCanAdvanceAppreciationWithoutOfflineBlockingPlayer()
    {
        var harness = new GameTestHarness();
        harness.CompleteRoundToAppreciation(4);

        harness.Game.SubmitAppreciationDone("c1");
        harness.Game.SubmitAppreciationDone("c2");
        harness.Game.SubmitAppreciationDone("c3");
        harness.Game.Disconnect("c4");

        var result = harness.Game.AdvancePhaseWithoutOfflinePlayers("c1");

        Assert.True(result.Success, result.Error);
        Assert.Equal(GamePhase.Scoreboard, result.Data!.Phase);
        Assert.True(result.Data.Players.Single(p => p.Id == "p4").IsActive);
        Assert.Equal(20, result.Data.Players.Sum(p => p.Score));
    }

    [Fact]
    public void PromptSkipUsesOfflineSavedDraftAndPreservesActiveRound()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(4);
        Assert.True(harness.Game.SavePromptDraft("c4", " Offline draft ", 1).Success);
        harness.Game.SubmitPrompt("c1", "Prompt 1");
        harness.Game.SubmitPrompt("c2", "Prompt 2");
        harness.Game.SubmitPrompt("c3", "Prompt 3");
        harness.Game.Disconnect("c4");

        var result = harness.Game.AdvancePhaseWithoutOfflinePlayers("c1");

        Assert.True(result.Success, result.Error);
        Assert.Equal("Offline draft", harness.Game.State.Prompts["p4"].Text);
        Assert.Equal(CompletionKind.SavedDraft, harness.Game.State.Prompts["p4"].CompletionKind);
        Assert.True(harness.Game.State.Prompts["p4"].CompletedWhileOffline);
        Assert.True(harness.Game.State.Players.Single(p => p.Id == "p4").IsActive);
    }

    [Fact]
    public void SubmissionSkipCompletesOnlyMissingOfflineBribesAndPreservesSubmittedBribe()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(4);
        harness.SubmitPromptsForActivePlayers();
        var p4State = harness.GetPlayerState("p4");
        var submittedTarget = p4State.Submission!.Targets[0].PlayerId;
        var missingTarget = p4State.Submission.Targets[1].PlayerId;
        Assert.True(harness.Game.SubmitBribe("c4", submittedTarget, "Already sent").Success);
        SubmitBribesExceptPlayer(harness, "p4");
        harness.Game.Disconnect("c4");

        var result = harness.Game.AdvancePhaseWithoutOfflinePlayers("c1");

        Assert.True(result.Success, result.Error);
        Assert.Equal(GamePhase.Voting, result.Data!.Phase);
        var submitted = harness.Game.State.Bribes.Values.Single(b => b.FromPlayerId == "p4" && b.ToPlayerId == submittedTarget);
        var completed = harness.Game.State.Bribes.Values.Single(b => b.FromPlayerId == "p4" && b.ToPlayerId == missingTarget);
        Assert.Equal(CompletionKind.PlayerSubmitted, submitted.CompletionKind);
        Assert.False(submitted.CompletedWhileOffline);
        Assert.Equal(CompletionKind.Fallback, completed.CompletionKind);
        Assert.True(completed.CompletedWhileOffline);
    }

    [Fact]
    public void SubmissionSkipUsesOfflineBribeDraft()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(4);
        harness.SubmitPromptsForActivePlayers();
        var p4Target = harness.GetPlayerState("p4").Submission!.Targets[0].PlayerId;
        Assert.True(harness.Game.SaveBribeDraft("c4", p4Target, " Draft bribe ", null, 1).Success);
        SubmitBribesExceptPlayer(harness, "p4");
        harness.Game.Disconnect("c4");

        var result = harness.Game.AdvancePhaseWithoutOfflinePlayers("c1");

        Assert.True(result.Success, result.Error);
        var completed = harness.Game.State.Bribes.Values.Single(b => b.FromPlayerId == "p4" && b.ToPlayerId == p4Target);
        Assert.Equal("Draft bribe", completed.Text);
        Assert.Equal(CompletionKind.SavedDraft, completed.CompletionKind);
        Assert.True(completed.CompletedWhileOffline);
    }

    [Fact]
    public void VotingSkipUsesOfflineDraftVoteAndPreservesCandidateBribes()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(4);
        harness.SubmitPromptsForActivePlayers();
        harness.SubmitAllAssignedBribes();
        var draftVote = harness.GetPlayerState("p4").Voting!.Bribes[0].BribeId;
        Assert.True(harness.Game.SaveVoteDraft("c4", draftVote, 1).Success);
        SubmitVotesExcept(harness, "p4");
        var bribesBefore = harness.Game.State.Bribes.Count;
        harness.Game.Disconnect("c4");

        var result = harness.Game.AdvancePhaseWithoutOfflinePlayers("c1");

        Assert.True(result.Success, result.Error);
        Assert.Equal(GamePhase.Appreciation, result.Data!.Phase);
        Assert.Equal(bribesBefore, harness.Game.State.Bribes.Count);
        Assert.Equal(draftVote, harness.Game.State.Votes["p4"].BribeId);
        Assert.Equal(CompletionKind.SavedDraft, harness.Game.State.Votes["p4"].CompletionKind);
        Assert.True(harness.Game.State.Votes["p4"].CompletedWhileOffline);
    }

    [Fact]
    public void OfflineAfterSubmittingCurrentWorkStaysActiveAndCanBlockFutureWork()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(4);
        harness.Game.SubmitPrompt("c1", "Prompt 1");
        harness.Game.SubmitPrompt("c2", "Prompt 2");
        harness.Game.SubmitPrompt("c3", "Prompt 3");
        harness.Game.SubmitPrompt("c4", "Prompt 4");

        Assert.Equal(GamePhase.Submission, harness.Game.State.Phase);
        harness.Game.Disconnect("c4");

        var state = harness.GetPlayerState("p1");
        Assert.True(state.Players.Single(p => p.Id == "p4").IsActive);
        Assert.Equal(["Player 4"], state.OfflineBlockingPlayerNames);
        Assert.True(state.CanHostAdvanceWithoutOfflinePlayers);
    }

    [Fact]
    public void DisconnectedStaleConnectionCannotAct()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(4);
        harness.Game.Disconnect("c4");

        Assert.False(harness.Game.SubmitPrompt("c4", "Stale prompt").Success);
        Assert.False(harness.Game.SavePromptDraft("c4", "Stale draft", 1).Success);

        harness.Game.AdvancePhaseWithoutOfflinePlayers("c1");
        Assert.False(harness.Game.SubmitBribe("c4", "p1", "Stale bribe").Success);
    }

    private static void SubmitBribesExceptPlayer(GameTestHarness harness, string excludedPlayerId)
    {
        foreach (var player in harness.ActivePlayers().Where(p => p.Id != excludedPlayerId))
        {
            var state = harness.GetPlayerState(player.Id);

            foreach (var target in state.Submission!.Targets)
            {
                if (state.Submission.SubmittedTargetPlayerIds.Contains(target.PlayerId))
                    continue;

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

    private static void SubmitVotesExcept(GameTestHarness harness, string excludedPlayerId)
    {
        foreach (var player in harness.ActivePlayers().Where(p => p.Id != excludedPlayerId))
        {
            var state = harness.GetPlayerState(player.Id);
            var result = harness.Game.SubmitVote(player.ConnectionId, state.Voting!.Bribes[0].BribeId);
            Assert.True(result.Success, result.Error);
        }
    }
}
