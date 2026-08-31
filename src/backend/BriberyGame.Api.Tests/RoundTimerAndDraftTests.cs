namespace BriberyGame.Api.Tests;

using BriberyGame.Api.Models;
using BriberyGame.Api.Services;

public class RoundTimerAndDraftTests
{
    private DateTimeOffset _now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void TimerSettingsDefaultToDisabledWithExpectedDurations()
    {
        var game = NewReadyGame();
        var state = game.GetConnectedPlayerStates().Single(s => s.ConnectionId == "c1").State;

        Assert.False(state.Settings.PromptTimer.Enabled);
        Assert.Equal(120, state.Settings.PromptTimer.DurationSeconds);
        Assert.False(state.Settings.SubmissionTimer.Enabled);
        Assert.Equal(300, state.Settings.SubmissionTimer.DurationSeconds);
        Assert.False(state.Settings.VotingTimer.Enabled);
        Assert.Equal(90, state.Settings.VotingTimer.DurationSeconds);
        Assert.False(state.Settings.AppreciationTimer.Enabled);
        Assert.Equal(120, state.Settings.AppreciationTimer.DurationSeconds);
    }

    [Fact]
    public void HostCanEnableTimerAndPhaseStartStampsServerTimes()
    {
        var game = NewReadyGame();
        var result = game.UpdateGameSettings("c1", Settings(promptSeconds: 120));
        Assert.True(result.Success, result.Error);

        var started = game.StartGame("c1");

        Assert.True(started.Success, started.Error);
        Assert.True(started.Data!.TimerEnabled);
        Assert.Equal(_now, started.Data.PhaseStartedAtUtc);
        Assert.Equal(_now.AddSeconds(120), started.Data.PhaseEndsAtUtc);
        Assert.Equal(120, started.Data.PhaseDurationSeconds);
    }

    [Fact]
    public void NonHostCannotUpdateSettingsAndInvalidDurationsAreRejected()
    {
        var game = NewReadyGame();

        Assert.False(game.UpdateGameSettings("c2", Settings(promptSeconds: 120)).Success);
        Assert.False(game.UpdateGameSettings("c1", Settings(promptSeconds: 601)).Success);
    }

    [Fact]
    public void PromptExpiryUsesDraftsAndRandomFallbacksWithoutWaiting()
    {
        var game = NewReadyGame();
        Assert.True(game.UpdateGameSettings("c1", Settings(promptSeconds: 30)).Success);
        Assert.True(game.StartGame("c1").Success);
        Assert.True(game.SavePromptDraft("c1", " Draft prompt ", 1).Success);

        _now = _now.AddSeconds(31);
        var changed = game.ExpireCurrentPhaseIfDue(_now);

        Assert.True(changed);
        Assert.Equal(GamePhase.Submission, game.State.Phase);
        Assert.Equal("Draft prompt", game.State.Prompts["p1"].Text);
        Assert.All(game.State.Prompts.Values, prompt => Assert.False(string.IsNullOrWhiteSpace(prompt.Text)));
    }

    [Fact]
    public void SubmissionExpiryUsesDraftMediaTextAndFallbackText()
    {
        var game = StartSubmissionWithTimers();
        var p1Targets = game.GetConnectedPlayerStates().Single(s => s.ConnectionId == "c1").State.Submission!.Targets;
        var textTarget = p1Targets[0].PlayerId;
        var mediaTarget = p1Targets[1].PlayerId;
        var media = new BribeMedia
        {
            MediaId = "m1",
            Url = "/api/media/m1",
            ContentType = "image/png",
            ByteSize = 10
        };

        Assert.True(game.SaveBribeDraft("c1", textTarget, "Draft bribe", null, 1).Success);
        Assert.True(game.SaveBribeDraft("c1", mediaTarget, "", media, 1).Success);

        _now = _now.AddSeconds(301);
        Assert.True(game.ExpireCurrentPhaseIfDue(_now));

        Assert.Equal(GamePhase.Voting, game.State.Phase);
        Assert.Contains(game.State.Bribes.Values, bribe => bribe.Text == "Draft bribe");
        Assert.Contains(game.State.Bribes.Values, bribe => bribe.Media?.MediaId == "m1");
        Assert.Contains(game.State.Bribes.Values, bribe => bribe.Text == "<didn't submit a bribe in time, for shame>");
    }

    [Fact]
    public void SubmissionExpiryFillsEveryConfiguredAssignment()
    {
        var game = new Game("TEST", () => _now);
        for (var i = 1; i <= 4; i++)
        {
            Assert.True(game.Join($"c{i}", $"p{i}", $"Player {i}").Success);
            Assert.True(game.ToggleReady($"c{i}").Success);
        }

        var settings = Settings(submissionSeconds: 300);
        settings.PromptsAnsweredPerPlayer = 3;
        Assert.True(game.UpdateGameSettings("c1", settings).Success);
        Assert.True(game.StartGame("c1").Success);
        for (var i = 1; i <= 4; i++)
            Assert.True(game.SubmitPrompt($"c{i}", $"Prompt {i}").Success);

        _now = _now.AddSeconds(301);
        Assert.True(game.ExpireCurrentPhaseIfDue(_now));

        Assert.Equal(GamePhase.Voting, game.State.Phase);
        Assert.Equal(12, game.State.Bribes.Count);
        Assert.All(game.GetConnectedPlayerStates(), state => Assert.Equal(3, state.State.Voting!.Bribes.Count));
    }

    [Fact]
    public void VotingExpiryUsesDraftOrRandomVoteAndBuildsResults()
    {
        var game = StartVotingWithTimers();
        var p1State = game.GetConnectedPlayerStates().Single(s => s.ConnectionId == "c1").State;
        var draftVote = p1State.Voting!.Bribes[0].BribeId;
        Assert.True(game.SaveVoteDraft("c1", draftVote, 1).Success);

        _now = _now.AddSeconds(91);
        Assert.True(game.ExpireCurrentPhaseIfDue(_now));

        Assert.Equal(GamePhase.Appreciation, game.State.Phase);
        Assert.Equal(draftVote, game.State.Votes["p1"].BribeId);
        Assert.Equal(3, game.State.RoundResults.Count);
    }

    [Fact]
    public void AppreciationExpiryMarksEveryoneDoneAndAppliesScores()
    {
        var game = StartAppreciationWithTimers();

        _now = _now.AddSeconds(121);
        Assert.True(game.ExpireCurrentPhaseIfDue(_now));

        Assert.Equal(GamePhase.Scoreboard, game.State.Phase);
        Assert.Equal(3, game.State.AppreciationDonePlayerIds.Count);
        Assert.NotEmpty(game.State.RoundScores);
    }

    [Fact]
    public void StaleDraftVersionsDoNotOverwriteNewerDrafts()
    {
        var game = NewReadyGame();
        Assert.True(game.UpdateGameSettings("c1", Settings(promptSeconds: 30)).Success);
        Assert.True(game.StartGame("c1").Success);
        Assert.True(game.SavePromptDraft("c1", "Newer", 2).Success);
        Assert.True(game.SavePromptDraft("c1", "Older", 1).Success);

        var state = game.GetConnectedPlayerStates().Single(s => s.ConnectionId == "c1").State;
        Assert.Equal("Newer", state.Prompt!.DraftText);
    }

    [Fact]
    public void GameServiceExpiryReturnsChangedGameIds()
    {
        var service = new GameService(new MediaStore(), () => _now);
        var gameId = service.CreateGame();
        JoinReady(service, gameId, 3);
        Assert.True(service.UpdateGameSettings("c1", Settings(promptSeconds: 10)).result!.Success);
        Assert.True(service.StartGame("c1").result!.Success);

        _now = _now.AddSeconds(11);
        var changedGameIds = service.ExpireDuePhases();

        Assert.Contains(gameId, changedGameIds);
    }

    private Game NewReadyGame()
    {
        var game = new Game("TEST", () => _now);
        for (var i = 1; i <= 3; i++)
        {
            Assert.True(game.Join($"c{i}", $"p{i}", $"Player {i}").Success);
            Assert.True(game.ToggleReady($"c{i}").Success);
        }

        return game;
    }

    private Game StartSubmissionWithTimers()
    {
        var game = NewReadyGame();
        Assert.True(game.UpdateGameSettings(
            "c1",
            Settings(submissionSeconds: 300, votingSeconds: 90, appreciationSeconds: 120)).Success);
        Assert.True(game.StartGame("c1").Success);
        for (var i = 1; i <= 3; i++)
            Assert.True(game.SubmitPrompt($"c{i}", $"Prompt {i}").Success);

        return game;
    }

    private Game StartVotingWithTimers()
    {
        var game = StartSubmissionWithTimers();
        foreach (var player in game.State.Players.Where(p => p.IsActive).ToList())
        {
            var state = game.GetConnectedPlayerStates().Single(s => s.ConnectionId == player.ConnectionId).State;
            foreach (var target in state.Submission!.Targets)
                Assert.True(game.SubmitBribe(player.ConnectionId, target.PlayerId, $"Bribe {player.Id} to {target.PlayerId}").Success);
        }

        return game;
    }

    private Game StartAppreciationWithTimers()
    {
        var game = StartVotingWithTimers();
        foreach (var player in game.State.Players.Where(p => p.IsActive).ToList())
        {
            var state = game.GetConnectedPlayerStates().Single(s => s.ConnectionId == player.ConnectionId).State;
            Assert.True(game.SubmitVote(player.ConnectionId, state.Voting!.Bribes[0].BribeId).Success);
        }

        return game;
    }

    private static GameSettings Settings(
        int? promptSeconds = null,
        int? submissionSeconds = null,
        int? votingSeconds = null,
        int? appreciationSeconds = null)
    {
        return new GameSettings
        {
            PromptTimer = new PhaseTimerSettings { Enabled = promptSeconds != null, DurationSeconds = promptSeconds ?? 120 },
            SubmissionTimer = new PhaseTimerSettings { Enabled = submissionSeconds != null, DurationSeconds = submissionSeconds ?? 300 },
            VotingTimer = new PhaseTimerSettings { Enabled = votingSeconds != null, DurationSeconds = votingSeconds ?? 90 },
            AppreciationTimer = new PhaseTimerSettings { Enabled = appreciationSeconds != null, DurationSeconds = appreciationSeconds ?? 120 }
        };
    }

    private static void JoinReady(GameService service, string gameId, int count)
    {
        for (var i = 1; i <= count; i++)
        {
            Assert.True(service.Join(gameId, $"c{i}", $"p{i}", $"Player {i}").result!.Success);
            Assert.True(service.ToggleReady($"c{i}").result!.Success);
        }
    }
}
