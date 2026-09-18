namespace BriberyGame.Api.Tests;

using BriberyGame.Api.Models;

public class MissingSubmissionTests
{
    private DateTimeOffset _now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void BlankPromptUsesCanonicalLibraryAndOnlyOwnerSeesAutomaticMarker()
    {
        var game = ReadyGame(Settings(prompt: 10, submission: 10));
        Assert.True(game.StartGame("c1").Success);
        Assert.True(game.SavePromptDraft("c2", "Idea button prompt", 1).Success);

        Expire(game, 11);

        Assert.Contains(game.State.Prompts["p1"].Text, PromptLibrary.All);
        Assert.True(game.State.Prompts["p1"].WasAutomaticallySelected);
        Assert.False(game.State.Prompts["p2"].WasAutomaticallySelected);

        Expire(game, 11);

        Assert.True(State(game, "p1").Voting!.PromptWasAutomaticallySelected);
        Assert.False(State(game, "p2").Voting!.PromptWasAutomaticallySelected);
        Assert.All(State(game, "p2").Voting!.Bribes, bribe => Assert.True(bribe.IsSelectable));
    }

    [Fact]
    public void AutoFillCreatesAnonymousSelectableFallbacksThatCannotScoreOrReceiveCoins()
    {
        var game = StartSubmission(Settings(submission: 10));
        Expire(game, 11);

        Assert.All(game.State.Bribes.Values, bribe =>
        {
            Assert.Equal(BribeSubmissionOrigin.RandomFallback, bribe.Origin);
            Assert.InRange(bribe.Text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length, 2, 3);
        });
        Assert.All(game.GetConnectedPlayerStates(), state =>
            Assert.All(state.State.Voting!.Bribes, bribe => Assert.True(bribe.IsSelectable)));

        foreach (var player in game.State.Players.Where(player => player.IsActive))
        {
            var bribe = State(game, player.Id).Voting!.Bribes[0];
            Assert.True(game.SubmitVote(player.ConnectionId, bribe.BribeId).Success);
        }

        Assert.All(game.State.RoundResults, result => Assert.Equal(RoundResultOutcome.RandomFallbackWinner, result.Outcome));
        var resultState = State(game, "p1").Appreciation!.RoundResults[0];
        Assert.False(resultState.CanCurrentPlayerAwardCoin);
        Assert.NotNull(resultState.WinningBribeId);
        Assert.False(game.ToggleAppreciationCoin("c1", resultState.WinningBribeId!).Success);

        foreach (var player in game.State.Players.Where(player => player.IsActive))
            Assert.True(game.SubmitAppreciationDone(player.ConnectionId).Success);

        Assert.All(game.State.RoundScores, score =>
        {
            Assert.Equal(0, score.ChosenBribeCount);
            Assert.Equal(0, score.TotalRoundPoints);
        });
    }

    [Fact]
    public void NoFallbackShowsDisabledEntriesAndRequiresNoWinnerAcknowledgement()
    {
        var settings = Settings(submission: 10);
        settings.BribeFallbackMode = BribeFallbackMode.NoFallback;
        var game = StartSubmission(settings);
        Expire(game, 11);

        var p1Voting = State(game, "p1").Voting!;
        Assert.True(p1Voting.CanAcknowledgeNoBribes);
        Assert.False(p1Voting.HasCompletedVoting);
        Assert.All(p1Voting.Bribes, bribe =>
        {
            Assert.False(bribe.IsSelectable);
            Assert.Equal("No bribe submitted", bribe.Text);
        });
        Assert.False(game.SubmitVote("c1", p1Voting.Bribes[0].BribeId).Success);
        Assert.False(game.SaveVoteDraft("c1", p1Voting.Bribes[0].BribeId, 1).Success);

        Assert.True(game.AcknowledgeNoBribes("c1").Success);
        Assert.True(State(game, "p1").Voting!.HasCompletedVoting);
        Assert.False(State(game, "p1").Voting!.CanAcknowledgeNoBribes);
        Assert.False(game.AcknowledgeNoBribes("c1").Success);
        Assert.True(game.AcknowledgeNoBribes("c2").Success);
        Assert.True(game.AcknowledgeNoBribes("c3").Success);

        Assert.Equal(GamePhase.Appreciation, game.State.Phase);
        Assert.Equal(3, game.State.RoundResults.Count);
        Assert.All(game.State.RoundResults, result =>
        {
            Assert.Equal(RoundResultOutcome.NoWinner, result.Outcome);
            Assert.Null(result.WinningBribeId);
            Assert.Null(result.WinningPlayerId);
        });
    }

    [Fact]
    public void VotingTimeoutPrefersRealSubmissionOverGeneratedSavedDraft()
    {
        var game = StartSubmission(Settings(submission: 10, voting: 10));
        var p1Sender = game.State.TargetAssignments
            .First(assignment => assignment.Value.Contains("p1"))
            .Key;
        var sender = game.State.Players.Single(player => player.Id == p1Sender);
        Assert.True(game.SubmitBribe(sender.ConnectionId, "p1", "A real bribe").Success);

        Expire(game, 11);

        var p1Voting = State(game, "p1").Voting!;
        var generated = p1Voting.Bribes.Single(bribe =>
            game.State.Bribes[bribe.BribeId].Origin == BribeSubmissionOrigin.RandomFallback);
        Assert.True(game.SaveVoteDraft("c1", generated.BribeId, 1).Success);

        Expire(game, 11);

        var selected = game.State.Bribes[game.State.Votes["p1"].BribeId!];
        Assert.Equal(BribeSubmissionOrigin.Submitted, selected.Origin);
        Assert.Equal("A real bribe", selected.Text);
    }

    [Fact]
    public void VotingTimeoutRecordsNoWinnerForEmptyBallots()
    {
        var settings = Settings(submission: 10, voting: 10);
        settings.BribeFallbackMode = BribeFallbackMode.NoFallback;
        var game = StartSubmission(settings);

        Expire(game, 11);
        Expire(game, 11);

        Assert.Equal(GamePhase.Appreciation, game.State.Phase);
        Assert.All(game.State.Votes.Values, vote => Assert.Null(vote.BribeId));
        Assert.All(game.State.RoundResults, result => Assert.Equal(RoundResultOutcome.NoWinner, result.Outcome));
    }

    [Fact]
    public void SettingsDefaultAndClonePreserveAutoFillMode()
    {
        var settings = new GameSettings();
        Assert.Equal(BribeFallbackMode.AutoFill, settings.BribeFallbackMode);
        Assert.Equal(BribeFallbackMode.AutoFill, settings.Clone().BribeFallbackMode);

        settings.BribeFallbackMode = BribeFallbackMode.NoFallback;
        Assert.Equal(BribeFallbackMode.NoFallback, settings.Clone().BribeFallbackMode);
    }

    private Game ReadyGame(GameSettings settings)
    {
        var game = new Game("TEST", () => _now);
        for (var index = 1; index <= 3; index++)
        {
            Assert.True(game.Join($"c{index}", $"p{index}", $"Player {index}").Success);
            Assert.True(game.ToggleReady($"c{index}").Success);
        }
        Assert.True(game.UpdateGameSettings("c1", settings).Success);
        return game;
    }

    private Game StartSubmission(GameSettings settings)
    {
        var game = ReadyGame(settings);
        Assert.True(game.StartGame("c1").Success);
        for (var index = 1; index <= 3; index++)
            Assert.True(game.SubmitPrompt($"c{index}", $"Prompt {index}").Success);
        Assert.Equal(GamePhase.Submission, game.State.Phase);
        return game;
    }

    private void Expire(Game game, int seconds)
    {
        _now = _now.AddSeconds(seconds);
        Assert.True(game.ExpireCurrentPhaseIfDue(_now));
    }

    private static GameStateDto State(Game game, string playerId) =>
        game.GetConnectedPlayerStates().Single(state => state.State.CurrentPlayerId == playerId).State;

    private static GameSettings Settings(int? prompt = null, int? submission = null, int? voting = null) => new()
    {
        PromptTimer = new PhaseTimerSettings { Enabled = prompt != null, DurationSeconds = prompt ?? 120 },
        SubmissionTimer = new PhaseTimerSettings { Enabled = submission != null, DurationSeconds = submission ?? 300 },
        VotingTimer = new PhaseTimerSettings { Enabled = voting != null, DurationSeconds = voting ?? 90 },
        AppreciationTimer = new PhaseTimerSettings { Enabled = false, DurationSeconds = 120 }
    };
}
