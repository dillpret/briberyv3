namespace BriberyGame.Api.Tests;

using BriberyGame.Api.Models;

public class LateJoinAndWaitingTests
{
    [Theory]
    [InlineData(GamePhase.Prompt)]
    [InlineData(GamePhase.Submission)]
    [InlineData(GamePhase.Voting)]
    [InlineData(GamePhase.Results)]
    public void PlayerJoiningAfterLobbyIsInactiveForCurrentRound(GamePhase joinPhase)
    {
        var harness = new GameTestHarness();
        MoveToPhase(harness, joinPhase);

        var state = harness.Game.Join("c4", "p4", "Late Player");

        Assert.False(state.IsCurrentPlayerActive);
        Assert.False(state.Players.Single(p => p.Id == "p4").IsActive);
    }

    [Fact]
    public void InactiveLateJoinerCannotActDuringCurrentRound()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);
        harness.Game.Join("c4", "p4", "Late Player");

        Assert.False(harness.Game.SubmitPrompt("c4", "Late prompt").Success);

        harness.SubmitPromptsForActivePlayers();

        var lateSubmissionState = harness.GetPlayerState("p4");
        Assert.False(lateSubmissionState.IsCurrentPlayerActive);
        Assert.Empty(lateSubmissionState.Submission!.Targets);
        Assert.False(harness.Game.SubmitBribe("c4", "p1", "Late bribe").Success);

        harness.SubmitAllAssignedBribes();

        var lateVotingState = harness.GetPlayerState("p4");
        Assert.False(lateVotingState.IsCurrentPlayerActive);
        Assert.Empty(lateVotingState.Voting!.Bribes);
        Assert.False(harness.Game.SubmitVote("c4", "not-a-real-bribe").Success);
    }

    [Fact]
    public void LateJoinerBecomesActiveWhenHostStartsNextRound()
    {
        var harness = new GameTestHarness();
        harness.CompleteRoundToResults();
        harness.Game.Join("c4", "p4", "Late Player");

        var result = harness.Game.StartNextRound("c1");

        Assert.True(result.Success, result.Error);
        Assert.Equal(GamePhase.Prompt, harness.Game.State.Phase);
        Assert.True(harness.Game.State.Players.Single(p => p.Id == "p4").IsActive);
        Assert.True(harness.GetPlayerState("p4").IsCurrentPlayerActive);
    }

    private static void MoveToPhase(GameTestHarness harness, GamePhase phase)
    {
        harness.StartPromptPhaseWithPlayers(3);

        if (phase == GamePhase.Prompt)
            return;

        harness.SubmitPromptsForActivePlayers();

        if (phase == GamePhase.Submission)
            return;

        harness.SubmitAllAssignedBribes();

        if (phase == GamePhase.Voting)
            return;

        harness.SubmitAllVotes();
    }
}
