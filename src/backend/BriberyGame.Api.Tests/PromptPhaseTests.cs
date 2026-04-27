namespace BriberyGame.Api.Tests;

using BriberyGame.Api.Models;

public class PromptPhaseTests
{
    [Fact]
    public void PromptSubmissionIsOnlyAllowedDuringPromptPhase()
    {
        var harness = new GameTestHarness();
        harness.JoinAndReadyPlayers(3);

        var result = harness.Game.SubmitPrompt("c1", "Too soon");

        Assert.False(result.Success);
        Assert.Equal(GamePhase.Lobby, harness.Game.State.Phase);
    }

    [Fact]
    public void PromptMustBeNonEmptyAndAtMostTwoHundredCharacters()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);

        Assert.False(harness.Game.SubmitPrompt("c1", "   ").Success);
        Assert.False(harness.Game.SubmitPrompt("c1", new string('x', 201)).Success);

        var valid = harness.Game.SubmitPrompt("c1", new string('x', 200));

        Assert.True(valid.Success, valid.Error);
    }

    [Fact]
    public void DuplicatePromptSubmissionFails()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);

        Assert.True(harness.Game.SubmitPrompt("c1", "First prompt").Success);

        var duplicate = harness.Game.SubmitPrompt("c1", "Second prompt");

        Assert.False(duplicate.Success);
    }

    [Fact]
    public void PromptPhaseWaitsUntilAllActivePlayersSubmit()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);

        harness.Game.SubmitPrompt("c1", "Prompt 1");
        harness.Game.SubmitPrompt("c2", "Prompt 2");

        Assert.Equal(GamePhase.Prompt, harness.Game.State.Phase);

        var finalSubmission = harness.Game.SubmitPrompt("c3", "Prompt 3");

        Assert.True(finalSubmission.Success, finalSubmission.Error);
        Assert.Equal(GamePhase.Submission, harness.Game.State.Phase);
    }

    [Fact]
    public void PromptProjectionOnlyExposesCurrentPlayerSubmissionStatus()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);

        harness.Game.SubmitPrompt("c1", "Secret prompt text");
        var playerOneState = harness.GetPlayerState("p1");
        var playerTwoState = harness.GetPlayerState("p2");

        Assert.True(playerOneState.Prompt!.HasSubmittedPrompt);
        Assert.False(playerTwoState.Prompt!.HasSubmittedPrompt);
        Assert.Null(playerOneState.Submission);
        Assert.DoesNotContain(
            playerTwoState.GetType().GetProperties(),
            property => property.Name.Contains("PromptText", StringComparison.OrdinalIgnoreCase));
    }
}
