namespace BriberyGame.Api.Tests;

using BriberyGame.Api.Models;

public class VotingAndResultsTests
{
    [Fact]
    public void VotingProjectionOnlyContainsBribesSentToCurrentPlayer()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);
        harness.SubmitPromptsForActivePlayers();
        harness.SubmitAllAssignedBribes();

        foreach (var player in harness.ActivePlayers())
        {
            var state = harness.GetPlayerState(player.Id);

            Assert.NotNull(state.Voting);
            Assert.Equal(2, state.Voting.Bribes.Count);

            var internalReceivedBribes = harness.Game.State.Bribes.Values
                .Where(bribe => bribe.ToPlayerId == player.Id)
                .Select(bribe => bribe.Id)
                .Order()
                .ToList();

            Assert.Equal(internalReceivedBribes, state.Voting.Bribes.Select(b => b.BribeId).Order().ToList());
        }
    }

    [Fact]
    public void VotingProjectionDoesNotExposeSubmitterIdentity()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);
        harness.SubmitPromptsForActivePlayers();
        harness.SubmitAllAssignedBribes();

        var votingBribe = harness.GetPlayerState("p1").Voting!.Bribes[0];

        Assert.DoesNotContain(
            votingBribe.GetType().GetProperties(),
            property => property.Name.Contains("Player", StringComparison.OrdinalIgnoreCase) ||
                        property.Name.Contains("Submitter", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void PlayerCannotVoteForBribeThatWasNotSentToThem()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);
        harness.SubmitPromptsForActivePlayers();
        harness.SubmitAllAssignedBribes();

        var unrelatedBribe = harness.Game.State.Bribes.Values.First(bribe => bribe.ToPlayerId != "p1");

        var result = harness.Game.SubmitVote("c1", unrelatedBribe.Id);

        Assert.False(result.Success);
    }

    [Fact]
    public void DuplicateVoteFailsAndVotePersistsAcrossReconnect()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);
        harness.SubmitPromptsForActivePlayers();
        harness.SubmitAllAssignedBribes();
        var bribe = harness.GetPlayerState("p1").Voting!.Bribes[0];

        var firstVote = harness.Game.SubmitVote("c1", bribe.BribeId);
        var duplicateVote = harness.Game.SubmitVote("c1", bribe.BribeId);

        harness.Game.Disconnect("c1");
        var reconnectState = harness.Game.Join("c1-reconnected", "p1", "Player 1");

        Assert.True(firstVote.Success, firstVote.Error);
        Assert.False(duplicateVote.Success);
        Assert.Equal(bribe.BribeId, reconnectState.Voting!.SelectedBribeId);
    }

    [Fact]
    public void VotingTransitionsToResultsOnlyAfterEveryActivePlayerVotes()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);
        harness.SubmitPromptsForActivePlayers();
        harness.SubmitAllAssignedBribes();

        harness.Game.SubmitVote("c1", harness.GetPlayerState("p1").Voting!.Bribes[0].BribeId);
        harness.Game.SubmitVote("c2", harness.GetPlayerState("p2").Voting!.Bribes[0].BribeId);

        Assert.Equal(GamePhase.Voting, harness.Game.State.Phase);

        harness.Game.SubmitVote("c3", harness.GetPlayerState("p3").Voting!.Bribes[0].BribeId);

        Assert.Equal(GamePhase.Results, harness.Game.State.Phase);
    }

    [Fact]
    public void ResultsRevealWinnerIdentityAndAwardOnePointPerVote()
    {
        var harness = new GameTestHarness();

        harness.CompleteRoundToResults();

        var state = harness.GetPlayerState("p1");

        Assert.NotNull(state.Results);
        Assert.Equal(3, state.Results.RoundResults.Count);
        Assert.All(state.Results.RoundResults, result =>
        {
            Assert.False(string.IsNullOrWhiteSpace(result.PromptOwnerName));
            Assert.False(string.IsNullOrWhiteSpace(result.PromptText));
            Assert.False(string.IsNullOrWhiteSpace(result.WinningBribeText));
            Assert.False(string.IsNullOrWhiteSpace(result.WinningPlayerName));
        });
        Assert.Equal(3, state.Players.Sum(player => player.Score));
    }
}
