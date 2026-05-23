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
    public void VotingProjectionIncludesCurrentPlayersPrompt()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);

        var promptResult = harness.Game.SubmitPrompt("c1", "Secret prompt text");
        Assert.True(promptResult.Success, promptResult.Error);
        Assert.True(harness.Game.SubmitPrompt("c2", "Prompt for player 2").Success);
        Assert.True(harness.Game.SubmitPrompt("c3", "Prompt for player 3").Success);

        harness.SubmitAllAssignedBribes();

        var state = harness.GetPlayerState("p1");

        Assert.NotNull(state.Voting);
        Assert.Equal("Secret prompt text", state.Voting.PromptText);
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
    public void VotingProjectionIncludesMediaMetadataWithoutSubmitterIdentity()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);
        harness.SubmitPromptsForActivePlayers();

        var mediaTarget = harness.GetPlayerState("p1").Submission!.Targets[0];
        var mediaResult = harness.Game.SubmitBribe("c1", new SubmitBribeRequest
        {
            TargetPlayerId = mediaTarget.PlayerId,
            Media = new BribeMedia
            {
                MediaId = "media-1",
                Url = "/api/media/media-1",
                ContentType = "image/png",
                ByteSize = 2048
            }
        });
        Assert.True(mediaResult.Success, mediaResult.Error);

        harness.SubmitAllAssignedBribes();

        var projected = harness.GetPlayerState(mediaTarget.PlayerId).Voting!.Bribes
            .Single(bribe => bribe.Media?.MediaId == "media-1");

        Assert.Equal(BribeContentKind.Media, projected.Kind);
        Assert.Equal("/api/media/media-1", projected.Media!.Url);
        Assert.DoesNotContain(
            projected.GetType().GetProperties(),
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
        var reconnectState = harness.JoinPlayer("c1-reconnected", "p1", "Player 1");

        Assert.True(firstVote.Success, firstVote.Error);
        Assert.False(duplicateVote.Success);
        Assert.Equal(bribe.BribeId, reconnectState.Voting!.SelectedBribeId);
    }

    [Fact]
    public void VotingTransitionsToAppreciationOnlyAfterEveryActivePlayerVotes()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);
        harness.SubmitPromptsForActivePlayers();
        harness.SubmitAllAssignedBribes();

        harness.Game.SubmitVote("c1", harness.GetPlayerState("p1").Voting!.Bribes[0].BribeId);
        harness.Game.SubmitVote("c2", harness.GetPlayerState("p2").Voting!.Bribes[0].BribeId);

        Assert.Equal(GamePhase.Voting, harness.Game.State.Phase);

        harness.Game.SubmitVote("c3", harness.GetPlayerState("p3").Voting!.Bribes[0].BribeId);

        Assert.Equal(GamePhase.Appreciation, harness.Game.State.Phase);
    }

    [Fact]
    public void AppreciationRevealsWinnerIdentityWithoutScoringYet()
    {
        var harness = new GameTestHarness();

        harness.CompleteRoundToAppreciation();

        var state = harness.GetPlayerState("p1");

        Assert.NotNull(state.Appreciation);
        Assert.Equal(3, state.Appreciation.RoundResults.Count);
        Assert.All(state.Appreciation.RoundResults, result =>
        {
            Assert.False(string.IsNullOrWhiteSpace(result.PromptOwnerName));
            Assert.False(string.IsNullOrWhiteSpace(result.PromptText));
            Assert.False(string.IsNullOrWhiteSpace(result.WinningBribeText));
            Assert.False(string.IsNullOrWhiteSpace(result.WinningPlayerName));
        });
        Assert.Equal(0, state.Players.Sum(player => player.Score));
    }

    [Fact]
    public void AppreciationPreservesWinningMediaMetadata()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);
        harness.SubmitPromptsForActivePlayers();

        var mediaTarget = harness.GetPlayerState("p1").Submission!.Targets[0];
        var mediaResult = harness.Game.SubmitBribe("c1", new SubmitBribeRequest
        {
            TargetPlayerId = mediaTarget.PlayerId,
            Media = new BribeMedia
            {
                MediaId = "media-1",
                Url = "/api/media/media-1",
                ContentType = "image/gif",
                ByteSize = 4096
            }
        });
        Assert.True(mediaResult.Success, mediaResult.Error);

        harness.SubmitAllAssignedBribes();
        var mediaBribe = harness.GetPlayerState(mediaTarget.PlayerId).Voting!.Bribes
            .Single(bribe => bribe.Media?.MediaId == "media-1");
        var voteResult = harness.Game.SubmitVote(
            harness.Game.State.Players.Single(p => p.Id == mediaTarget.PlayerId).ConnectionId,
            mediaBribe.BribeId);
        Assert.True(voteResult.Success, voteResult.Error);

        foreach (var player in harness.ActivePlayers().Where(player => player.Id != mediaTarget.PlayerId))
        {
            var state = harness.GetPlayerState(player.Id);
            var result = harness.Game.SubmitVote(player.ConnectionId, state.Voting!.Bribes[0].BribeId);
            Assert.True(result.Success, result.Error);
        }

        var winningMedia = harness.GetPlayerState("p1").Appreciation!.RoundResults
            .Single(result => result.WinningBribeMedia?.MediaId == "media-1");

        Assert.Equal(BribeContentKind.Media, winningMedia.WinningBribeKind);
        Assert.Equal("image/gif", winningMedia.WinningBribeMedia!.ContentType);
    }

    [Fact]
    public void AppreciationRejectsCoinsForOwnBribeAndOwnPrompt()
    {
        var harness = new GameTestHarness();
        harness.CompleteRoundToAppreciation();

        var p1State = harness.GetPlayerState("p1");
        var ownWinningBribe = p1State.Appreciation!.RoundResults.FirstOrDefault(r => r.WinningPlayerId == "p1");
        var ownPromptWinner = p1State.Appreciation.RoundResults.Single(r => r.PromptOwnerPlayerId == "p1");

        if (ownWinningBribe != null)
        {
            var ownBribeResult = harness.Game.ToggleAppreciationCoin("c1", ownWinningBribe.WinningBribeId);
            Assert.False(ownBribeResult.Success);
        }

        var ownPromptResult = harness.Game.ToggleAppreciationCoin("c1", ownPromptWinner.WinningBribeId);
        Assert.False(ownPromptResult.Success);
    }

    [Fact]
    public void AppreciationAllowsCoinForBribeThatBeatCurrentPlayersBribe()
    {
        var harness = new GameTestHarness();
        harness.CompleteRoundToAppreciation();

        var beatenPrompt = harness.GetPlayerState("p2").Appreciation!.RoundResults
            .First(result => result.CurrentPlayerSubmittedBribe && !result.CurrentPlayerSubmittedWinningBribe);

        var result = harness.Game.ToggleAppreciationCoin("c2", beatenPrompt.WinningBribeId);

        Assert.True(result.Success, result.Error);
        Assert.True(result.Data!.Appreciation!.RoundResults
            .Single(r => r.WinningBribeId == beatenPrompt.WinningBribeId)
            .HasCurrentPlayerAwardedCoin);
    }

    [Fact]
    public void AppreciationCoinTogglesWithoutDoubleCounting()
    {
        var harness = new GameTestHarness();
        harness.CompleteRoundToAppreciation();

        var coinable = harness.GetPlayerState("p2").Appreciation!.RoundResults
            .First(result => result.CanCurrentPlayerAwardCoin);

        Assert.True(harness.Game.ToggleAppreciationCoin("c2", coinable.WinningBribeId).Success);
        Assert.True(harness.Game.ToggleAppreciationCoin("c2", coinable.WinningBribeId).Success);
        Assert.True(harness.Game.ToggleAppreciationCoin("c2", coinable.WinningBribeId).Success);

        var state = harness.GetPlayerState("p2");

        Assert.Equal(1, state.Appreciation!.RoundResults.Single(r => r.WinningBribeId == coinable.WinningBribeId).CoinCount);
    }

    [Fact]
    public void AppreciationWaitsForAllActivePlayersBeforeScoreboard()
    {
        var harness = new GameTestHarness();
        harness.CompleteRoundToAppreciation();

        harness.Game.SubmitAppreciationDone("c1");
        harness.Game.SubmitAppreciationDone("c2");

        Assert.Equal(GamePhase.Appreciation, harness.Game.State.Phase);

        harness.Game.SubmitAppreciationDone("c3");

        Assert.Equal(GamePhase.Scoreboard, harness.Game.State.Phase);
    }

    [Fact]
    public void ScoreboardUsesRoundedChunkAndBonusCoins()
    {
        var harness = new GameTestHarness();
        harness.CompleteRoundToAppreciation();

        var p1Coinable = harness.GetPlayerState("p2").Appreciation!.RoundResults
            .First(result => result.CanCurrentPlayerAwardCoin);
        Assert.True(harness.Game.ToggleAppreciationCoin("c2", p1Coinable.WinningBribeId).Success);
        harness.SubmitAllAppreciationDone();

        var scoreboard = harness.GetPlayerState("p1").Scoreboard!;
        var bonusWinner = scoreboard.RoundScores.Single(score => score.PlayerId == p1Coinable.WinningPlayerId);

        Assert.Equal(16, scoreboard.RoundScores.Sum(score => score.TotalRoundPoints));
        Assert.Equal(1, bonusWinner.BonusCoinPoints);
        Assert.All(scoreboard.RoundScores, score => Assert.Equal(score.ChosenBribeCount * 5, score.ChosenBribePoints));
        Assert.Equal(scoreboard.RoundScores.Sum(score => score.TotalRoundPoints), scoreboard.OverallScores.Sum(score => score.CumulativeScore));
    }
}
