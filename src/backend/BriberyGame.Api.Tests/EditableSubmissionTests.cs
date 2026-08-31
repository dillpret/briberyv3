namespace BriberyGame.Api.Tests;

using BriberyGame.Api.Models;

public class EditableSubmissionTests
{
    [Fact]
    public void SubmittedPromptCanBeReopenedAsPrivateVersionedDraftAndResubmitted()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);

        Assert.True(harness.Game.SubmitPrompt("c1", "Original prompt").Success);

        var ownerState = harness.GetPlayerState("p1");
        var otherState = harness.GetPlayerState("p2");
        Assert.Equal("Original prompt", ownerState.Prompt!.SubmittedText);
        Assert.Null(otherState.Prompt!.SubmittedText);

        var edit = harness.Game.EditPrompt("c1");

        Assert.True(edit.Success, edit.Error);
        Assert.Equal(GamePhase.Prompt, harness.Game.State.Phase);
        Assert.Equal(0, edit.Data!.PromptSubmittedCount);
        Assert.False(edit.Data.Prompt!.HasSubmittedPrompt);
        Assert.Equal("Original prompt", edit.Data.Prompt.DraftText);
        Assert.True(edit.Data.Prompt.DraftVersion > 0);
        Assert.Equal(PlayerPhaseStatus.Pending, edit.Data.Players.Single(player => player.Id == "p1").PhaseStatus);

        Assert.True(harness.Game.SavePromptDraft("c1", "Edited prompt", edit.Data.Prompt.DraftVersion + 1).Success);
        Assert.True(harness.Game.SubmitPrompt("c2", "Prompt 2").Success);
        Assert.True(harness.Game.SubmitPrompt("c3", "Prompt 3").Success);
        Assert.Equal(GamePhase.Prompt, harness.Game.State.Phase);

        var resubmit = harness.Game.SubmitPrompt("c1", "Edited prompt");

        Assert.True(resubmit.Success, resubmit.Error);
        Assert.Equal(GamePhase.Submission, harness.Game.State.Phase);
        Assert.Equal("Edited prompt", harness.Game.State.Prompts["p1"].Text);
    }

    [Fact]
    public void PromptEditRejectsMissingSubmissionWrongPhaseAndExpiredDeadline()
    {
        var now = new DateTimeOffset(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
        var game = ReadyGame(() => now);
        Assert.True(game.UpdateGameSettings("c1", TimedPromptSettings(30)).Success);
        Assert.True(game.StartGame("c1").Success);

        Assert.False(game.EditPrompt("c1").Success);
        Assert.True(game.SubmitPrompt("c1", "Submitted").Success);
        now = now.AddSeconds(30);
        Assert.False(game.EditPrompt("c1").Success);

        now = now.AddSeconds(1);
        Assert.True(game.ExpireCurrentPhaseIfDue(now));
        Assert.False(game.EditPrompt("c1").Success);
    }

    [Fact]
    public void PromptTimerFinalizesLatestReopenedDraft()
    {
        var now = new DateTimeOffset(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
        var game = ReadyGame(() => now);
        Assert.True(game.UpdateGameSettings("c1", TimedPromptSettings(30)).Success);
        Assert.True(game.StartGame("c1").Success);
        Assert.True(game.SubmitPrompt("c1", "Original").Success);
        var edit = game.EditPrompt("c1");
        Assert.True(edit.Success, edit.Error);
        Assert.True(game.SavePromptDraft("c1", "Timer draft", edit.Data!.Prompt!.DraftVersion + 1).Success);

        now = now.AddSeconds(31);
        Assert.True(game.ExpireCurrentPhaseIfDue(now));

        Assert.Equal(GamePhase.Submission, game.State.Phase);
        Assert.Equal("Timer draft", game.State.Prompts["p1"].Text);
    }

    [Fact]
    public void SubmittedBribeCanBeReopenedPerTargetAndResubmitted()
    {
        var harness = StartSubmission();
        var target = harness.GetPlayerState("p1").Submission!.Targets[0];
        Assert.True(harness.Game.SubmitBribe("c1", target.PlayerId, "Original bribe").Success);

        var ownerTarget = harness.GetPlayerState("p1").Submission!.Targets.Single(item => item.PlayerId == target.PlayerId);
        Assert.Equal("Original bribe", ownerTarget.SubmittedBribe!.Text);
        Assert.DoesNotContain(
            harness.GetPlayerState("p2").Submission!.Targets,
            item => item.SubmittedBribe?.Text == "Original bribe");

        var edit = harness.Game.EditBribe("c1", target.PlayerId);

        Assert.True(edit.Success, edit.Error);
        var reopened = edit.Data!.Submission!.Targets.Single(item => item.PlayerId == target.PlayerId);
        Assert.Equal("Original bribe", reopened.DraftText);
        Assert.Null(reopened.SubmittedBribe);
        Assert.DoesNotContain(target.PlayerId, edit.Data.Submission.SubmittedTargetPlayerIds);
        Assert.True(reopened.DraftVersion > 0);

        Assert.True(harness.Game.SaveBribeDraft(
            "c1",
            target.PlayerId,
            "Edited bribe",
            null,
            reopened.DraftVersion + 1).Success);
        var resubmit = harness.Game.SubmitBribe("c1", target.PlayerId, "Edited bribe");

        Assert.True(resubmit.Success, resubmit.Error);
        Assert.Contains(harness.Game.State.Bribes.Values, bribe =>
            bribe.FromPlayerId == "p1" &&
            bribe.ToPlayerId == target.PlayerId &&
            bribe.Text == "Edited bribe");
    }

    [Fact]
    public void ReopenedMediaBribeCanBecomeTextAndKeepsMediaDraftUntilChanged()
    {
        var harness = StartSubmission();
        var target = harness.GetPlayerState("p1").Submission!.Targets[0];
        var media = Media("media-original");
        Assert.True(harness.Game.SubmitBribe("c1", new SubmitBribeRequest
        {
            TargetPlayerId = target.PlayerId,
            Media = media
        }).Success);

        var edit = harness.Game.EditBribe("c1", target.PlayerId);
        Assert.True(edit.Success, edit.Error);
        var reopened = edit.Data!.Submission!.Targets.Single(item => item.PlayerId == target.PlayerId);
        Assert.Equal("media-original", reopened.DraftMedia!.MediaId);

        Assert.True(harness.Game.SaveBribeDraft(
            "c1",
            target.PlayerId,
            "Replacement text",
            null,
            reopened.DraftVersion + 1).Success);
        Assert.True(harness.Game.SubmitBribe("c1", target.PlayerId, "Replacement text").Success);

        var replacement = harness.Game.State.Bribes.Values.Single(bribe =>
            bribe.FromPlayerId == "p1" && bribe.ToPlayerId == target.PlayerId);
        Assert.Equal(BribeContentKind.Text, replacement.Kind);
        Assert.Equal("Replacement text", replacement.Text);
        Assert.Null(replacement.Media);
    }

    [Fact]
    public void BribeEditRejectsUnsubmittedAndUnassignedTargets()
    {
        var harness = StartSubmission(4);
        var state = harness.GetPlayerState("p1");
        var assigned = state.Submission!.Targets[0].PlayerId;
        var unassigned = state.Players
            .Where(player => player.IsActive && player.Id != "p1")
            .Select(player => player.Id)
            .Except(state.Submission.Targets.Select(target => target.PlayerId))
            .Single();

        Assert.False(harness.Game.EditBribe("c1", assigned).Success);
        Assert.False(harness.Game.EditBribe("c1", unassigned).Success);
    }

    [Fact]
    public void DisconnectAndReconnectPreserveReopenedBribeAsPendingDraft()
    {
        var harness = StartSubmission();
        var target = harness.GetPlayerState("p1").Submission!.Targets[0];
        Assert.True(harness.Game.SubmitBribe("c1", target.PlayerId, "Reconnect me").Success);
        Assert.True(harness.Game.EditBribe("c1", target.PlayerId).Success);

        harness.Game.Disconnect("c1");
        var reconnected = harness.JoinPlayer("c1-new", "p1", "Player 1");

        Assert.Equal(GamePhase.Submission, reconnected.Phase);
        Assert.Equal("Reconnect me", reconnected.Submission!.Targets.Single(item => item.PlayerId == target.PlayerId).DraftText);
        Assert.DoesNotContain(target.PlayerId, reconnected.Submission.SubmittedTargetPlayerIds);
    }

    [Fact]
    public void SubmissionTimerFinalizesChangedReopenedDraftAndFallbackForClearedDraft()
    {
        var now = new DateTimeOffset(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
        var game = ReadyGame(() => now);
        var settings = TimedPromptSettings(120);
        settings.PromptTimer.Enabled = false;
        settings.SubmissionTimer = new PhaseTimerSettings { Enabled = true, DurationSeconds = 30 };
        Assert.True(game.UpdateGameSettings("c1", settings).Success);
        Assert.True(game.StartGame("c1").Success);
        for (var index = 1; index <= 3; index++)
            Assert.True(game.SubmitPrompt($"c{index}", $"Prompt {index}").Success);

        var targets = game.GetConnectedPlayerStates()
            .Single(state => state.ConnectionId == "c1")
            .State.Submission!.Targets;
        Assert.True(game.SubmitBribe("c1", targets[0].PlayerId, "Original one").Success);
        Assert.True(game.SubmitBribe("c1", targets[1].PlayerId, "Original two").Success);

        var firstEdit = game.EditBribe("c1", targets[0].PlayerId);
        var firstDraft = firstEdit.Data!.Submission!.Targets.Single(target => target.PlayerId == targets[0].PlayerId);
        Assert.True(game.SaveBribeDraft("c1", targets[0].PlayerId, "Timer edit", null, firstDraft.DraftVersion + 1).Success);

        var secondEdit = game.EditBribe("c1", targets[1].PlayerId);
        var secondDraft = secondEdit.Data!.Submission!.Targets.Single(target => target.PlayerId == targets[1].PlayerId);
        Assert.True(game.SaveBribeDraft("c1", targets[1].PlayerId, "", null, secondDraft.DraftVersion + 1).Success);

        now = now.AddSeconds(31);
        Assert.True(game.ExpireCurrentPhaseIfDue(now));

        Assert.Contains(game.State.Bribes.Values, bribe =>
            bribe.FromPlayerId == "p1" && bribe.ToPlayerId == targets[0].PlayerId && bribe.Text == "Timer edit");
        Assert.Contains(game.State.Bribes.Values, bribe =>
            bribe.FromPlayerId == "p1" &&
            bribe.ToPlayerId == targets[1].PlayerId &&
            bribe.Text == "<didn't submit a bribe in time, for shame>");
    }

    [Fact]
    public void HostCanResolveDisconnectedPlayerWhoReopenedPrompt()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(4);
        Assert.True(harness.Game.SubmitPrompt("c4", "Reopened before disconnect").Success);
        Assert.True(harness.Game.EditPrompt("c4").Success);
        harness.Game.Disconnect("c4");

        Assert.True(harness.Game.SubmitPrompt("c1", "Prompt 1").Success);
        Assert.True(harness.Game.SubmitPrompt("c2", "Prompt 2").Success);
        Assert.True(harness.Game.SubmitPrompt("c3", "Prompt 3").Success);
        Assert.Equal(GamePhase.Prompt, harness.Game.State.Phase);

        var advance = harness.Game.AdvancePhaseWithoutOfflinePlayers("c1");

        Assert.True(advance.Success, advance.Error);
        Assert.Equal(GamePhase.Submission, harness.Game.State.Phase);
        Assert.False(harness.Game.State.Players.Single(player => player.Id == "p4").IsActive);
        Assert.DoesNotContain("p4", harness.Game.State.PromptDrafts.Keys);
    }

    private static GameTestHarness StartSubmission(int playerCount = 3)
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(playerCount);
        harness.SubmitPromptsForActivePlayers();
        return harness;
    }

    private static Game ReadyGame(Func<DateTimeOffset> now)
    {
        var game = new Game("TEST", now);
        for (var index = 1; index <= 3; index++)
        {
            Assert.True(game.Join($"c{index}", $"p{index}", $"Player {index}").Success);
            Assert.True(game.ToggleReady($"c{index}").Success);
        }

        return game;
    }

    private static GameSettings TimedPromptSettings(int seconds)
    {
        return new GameSettings
        {
            PromptTimer = new PhaseTimerSettings { Enabled = true, DurationSeconds = seconds },
            SubmissionTimer = new PhaseTimerSettings { Enabled = false, DurationSeconds = 300 },
            VotingTimer = new PhaseTimerSettings { Enabled = false, DurationSeconds = 90 },
            AppreciationTimer = new PhaseTimerSettings { Enabled = false, DurationSeconds = 120 }
        };
    }

    private static BribeMedia Media(string id)
    {
        return new BribeMedia
        {
            MediaId = id,
            Url = $"/api/media/{id}",
            ContentType = "image/png",
            ByteSize = 10
        };
    }
}
