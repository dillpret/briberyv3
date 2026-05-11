namespace BriberyGame.Api.Tests;

using BriberyGame.Api.Models;

public class SubmissionPhaseTests
{
    [Fact]
    public void EachActivePlayerReceivesTwoDistinctNonSelfTargetsWithPrompts()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);
        harness.SubmitPromptsForActivePlayers();

        foreach (var player in harness.ActivePlayers())
        {
            var state = harness.GetPlayerState(player.Id);

            Assert.NotNull(state.Submission);
            Assert.Equal(2, state.Submission.Targets.Count);
            Assert.Equal(2, state.Submission.Targets.Select(t => t.PlayerId).Distinct().Count());
            Assert.DoesNotContain(state.Submission.Targets, target => target.PlayerId == player.Id);
            Assert.All(state.Submission.Targets, target => Assert.False(string.IsNullOrWhiteSpace(target.Prompt)));
        }

        // WIP vs briefing: target assignment is currently deterministic ring assignment.
        // It does not yet implement historical matchup rotation or rebalancing.
    }

    [Fact]
    public void PlayerCannotSubmitBribeToUnassignedTarget()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(4);
        harness.SubmitPromptsForActivePlayers();

        var state = harness.GetPlayerState("p1");
        var unassignedTarget = state.Players
            .Where(p => p.IsActive && p.Id != "p1")
            .Select(p => p.Id)
            .Except(state.Submission!.Targets.Select(t => t.PlayerId))
            .Single();

        var result = harness.Game.SubmitBribe("c1", unassignedTarget, "Nope");

        Assert.False(result.Success);
    }

    [Fact]
    public void BribeMustBeNonEmptyAndAtMostFiveHundredCharacters()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);
        harness.SubmitPromptsForActivePlayers();
        var target = harness.GetPlayerState("p1").Submission!.Targets[0];

        Assert.False(harness.Game.SubmitBribe("c1", target.PlayerId, "   ").Success);
        Assert.False(harness.Game.SubmitBribe("c1", target.PlayerId, new string('x', 501)).Success);

        var valid = harness.Game.SubmitBribe("c1", target.PlayerId, new string('x', 500));

        Assert.True(valid.Success, valid.Error);
    }

    [Fact]
    public void PlayerCanSubmitValidImageOrGifBribeMetadata()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);
        harness.SubmitPromptsForActivePlayers();
        var target = harness.GetPlayerState("p1").Submission!.Targets[0];

        var result = harness.Game.SubmitBribe("c1", new SubmitBribeRequest
        {
            TargetPlayerId = target.PlayerId,
            Media = new BribeMedia
            {
                MediaId = "media-1",
                Url = "/api/media/media-1",
                ContentType = "image/gif",
                ByteSize = 1024
            }
        });

        Assert.True(result.Success, result.Error);
        var bribe = harness.Game.State.Bribes.Values.Single(b => b.FromPlayerId == "p1");
        Assert.Equal(BribeContentKind.Media, bribe.Kind);
        Assert.Equal("media-1", bribe.Media!.MediaId);
    }

    [Fact]
    public void MediaBribeMustUseSupportedTypeAndStayUnderEightMegabytes()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);
        harness.SubmitPromptsForActivePlayers();
        var target = harness.GetPlayerState("p1").Submission!.Targets[0];

        var unsupported = harness.Game.SubmitBribe("c1", new SubmitBribeRequest
        {
            TargetPlayerId = target.PlayerId,
            Media = new BribeMedia
            {
                MediaId = "media-1",
                Url = "/api/media/media-1",
                ContentType = "image/svg+xml",
                ByteSize = 1024
            }
        });

        var oversized = harness.Game.SubmitBribe("c1", new SubmitBribeRequest
        {
            TargetPlayerId = target.PlayerId,
            Media = new BribeMedia
            {
                MediaId = "media-2",
                Url = "/api/media/media-2",
                ContentType = "image/png",
                ByteSize = Game.MaxMediaBribeBytes + 1
            }
        });

        Assert.False(unsupported.Success);
        Assert.False(oversized.Success);
    }

    [Fact]
    public void DuplicateBribeForSameTargetFails()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);
        harness.SubmitPromptsForActivePlayers();
        var target = harness.GetPlayerState("p1").Submission!.Targets[0];

        Assert.True(harness.Game.SubmitBribe("c1", target.PlayerId, "First bribe").Success);

        var duplicate = harness.Game.SubmitBribe("c1", target.PlayerId, "Second bribe");

        Assert.False(duplicate.Success);
    }

    [Fact]
    public void SubmissionPhaseTransitionsToVotingOnlyAfterAllRequiredBribes()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);
        harness.SubmitPromptsForActivePlayers();

        var firstTarget = harness.GetPlayerState("p1").Submission!.Targets[0];
        harness.Game.SubmitBribe("c1", firstTarget.PlayerId, "One bribe");

        Assert.Equal(GamePhase.Submission, harness.Game.State.Phase);

        harness.SubmitAllAssignedBribes();

        Assert.Equal(GamePhase.Voting, harness.Game.State.Phase);
    }
}
