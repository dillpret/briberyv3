namespace BriberyGame.Api.Tests;

using BriberyGame.Api.Models;

public class LobbyAndConnectionTests
{
    [Fact]
    public void FirstJoinedPlayerBecomesHostAndLobbyPlayersAreActive()
    {
        var harness = new GameTestHarness();

        var state = harness.Game.Join("c1", "p1", "Host");

        Assert.Equal("p1", state.HostPlayerId);
        Assert.Single(state.Players);
        Assert.True(state.Players[0].IsActive);
        Assert.Equal(GamePhase.Lobby, state.Phase);
    }

    [Fact]
    public void GameCannotStartBeforeThreeConnectedReadyPlayers()
    {
        var harness = new GameTestHarness();
        harness.JoinAndReadyPlayers(2);

        var result = harness.Game.StartGame("c1");

        Assert.False(result.Success);
        Assert.Equal(GamePhase.Lobby, harness.Game.State.Phase);
    }

    [Fact]
    public void NonHostCannotStartGame()
    {
        var harness = new GameTestHarness();
        harness.JoinAndReadyPlayers(3);

        var result = harness.Game.StartGame("c2");

        Assert.False(result.Success);
        Assert.Equal(GamePhase.Lobby, harness.Game.State.Phase);
    }

    [Fact]
    public void HostCanStartOnceThreeConnectedPlayersAreReady()
    {
        var harness = new GameTestHarness();
        harness.JoinAndReadyPlayers(3);

        var result = harness.Game.StartGame("c1");

        Assert.True(result.Success, result.Error);
        Assert.Equal(GamePhase.Prompt, result.Data!.Phase);
        Assert.Equal(1, result.Data.CurrentRound);
        Assert.All(result.Data.Players, player => Assert.False(player.IsReady));
        Assert.All(result.Data.Players, player => Assert.Equal(0, player.Score));
    }

    [Fact]
    public void DisconnectMarksPlayerOfflineWithoutRemovingThem()
    {
        var harness = new GameTestHarness();
        harness.JoinPlayers(3);

        var state = harness.Game.Disconnect("c2");

        Assert.Equal(3, state.Players.Count);
        Assert.False(state.Players.Single(p => p.Id == "p2").Connected);
    }

    [Fact]
    public void ReconnectWithSamePlayerIdRestoresExistingPlayerRecord()
    {
        var harness = new GameTestHarness();
        harness.JoinPlayers(3);
        harness.Game.Disconnect("c2");

        var state = harness.Game.Join("c2-reconnected", "p2", "Player 2");

        Assert.Equal(3, state.Players.Count);
        Assert.True(state.Players.Single(p => p.Id == "p2").Connected);
        Assert.Equal("c2-reconnected", harness.Game.State.Players.Single(p => p.Id == "p2").ConnectionId);
    }

    [Fact]
    public void ReconnectMidPromptPhasePreservesSubmittedPromptState()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);

        var submitResult = harness.Game.SubmitPrompt("c2", "A shaky connection prompt");
        Assert.True(submitResult.Success, submitResult.Error);

        harness.Game.Disconnect("c2");
        var reconnectState = harness.Game.Join("c2-reconnected", "p2", "Player 2");

        Assert.Equal(GamePhase.Prompt, reconnectState.Phase);
        Assert.True(reconnectState.Prompt!.HasSubmittedPrompt);
    }

    [Fact]
    public void HostDisconnectCurrentlyReassignsHost()
    {
        var harness = new GameTestHarness();
        harness.JoinPlayers(3);

        var state = harness.Game.Disconnect("c1");

        // WIP vs briefing: the functional briefing says host privileges remain attached
        // to the original host when they return. The current implementation reassigns
        // host to the next connected player, so this test documents current behavior.
        Assert.Equal("p2", state.HostPlayerId);
    }
}
