namespace BriberyGame.Api.Tests;

using BriberyGame.Api.Models;

public class LobbyAndConnectionTests
{
    [Fact]
    public void FirstJoinedPlayerBecomesHostAndLobbyPlayersAreActive()
    {
        var harness = new GameTestHarness();

        var state = harness.JoinPlayer("c1", "p1", "Host");

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

        var state = harness.JoinPlayer("c2-reconnected", "p2", "Player 2");

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
        var reconnectState = harness.JoinPlayer("c2-reconnected", "p2", "Player 2");

        Assert.Equal(GamePhase.Prompt, reconnectState.Phase);
        Assert.True(reconnectState.Prompt!.HasSubmittedPrompt);
    }

    [Fact]
    public void NewPlayerCannotJoinWithSameNameAsOnlinePlayer()
    {
        var harness = new GameTestHarness();
        harness.JoinPlayers(3);

        var result = harness.Game.Join("c4", "p4", " player 2 ");

        Assert.False(result.Success);
        Assert.Equal("Another player with that name is already in the game. Please enter a different name.", result.Error);
        Assert.DoesNotContain(harness.Game.State.Players, p => p.Id == "p4");
    }

    [Fact]
    public void NewPlayerWithOfflinePlayerNameTakesOverExistingPlayerRecord()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);
        var promptResult = harness.Game.SubmitPrompt("c2", "A prompt before changing browsers");
        Assert.True(promptResult.Success, promptResult.Error);

        harness.Game.State.Players.Single(p => p.Id == "p2").Score = 7;
        harness.Game.Disconnect("c2");

        var result = harness.Game.Join("c2-new-browser", "brand-new-id", " player 2 ");

        Assert.True(result.Success, result.Error);
        Assert.Equal(3, result.Data!.Players.Count);
        Assert.Equal("p2", result.Data.CurrentPlayerId);
        Assert.True(result.Data.IsCurrentPlayerActive);
        Assert.True(result.Data.Prompt!.HasSubmittedPrompt);
        Assert.Equal(7, result.Data.Players.Single(p => p.Id == "p2").Score);
        Assert.Equal("c2-new-browser", harness.Game.State.Players.Single(p => p.Id == "p2").ConnectionId);
        Assert.DoesNotContain(harness.Game.State.Players, p => p.Id == "brand-new-id");
    }

    [Fact]
    public void SamePlayerIdOnDifferentConnectionIsRejectedWhilePlayerIsOnline()
    {
        var harness = new GameTestHarness();
        harness.JoinPlayers(3);

        var result = harness.Game.Join("c2-other-browser", "p2", "Player 2");

        Assert.False(result.Success);
        Assert.Equal("You are currently active on a different device or browser.", result.Error);
        Assert.Equal("c2", harness.Game.State.Players.Single(p => p.Id == "p2").ConnectionId);
    }

    [Fact]
    public void StaleOldConnectionDisconnectDoesNotMarkTakenOverPlayerOffline()
    {
        var harness = new GameTestHarness();
        harness.JoinPlayers(3);
        harness.Game.Disconnect("c2");
        harness.JoinPlayer("c2-new-browser", "brand-new-id", "Player 2");

        var state = harness.Game.Disconnect("c2");

        Assert.True(state.Players.Single(p => p.Id == "p2").Connected);
        Assert.Equal("c2-new-browser", harness.Game.State.Players.Single(p => p.Id == "p2").ConnectionId);
    }

    [Fact]
    public void OfflineWaitingPlayerRejoinedByNameStaysWaitingUntilNextRound()
    {
        var harness = new GameTestHarness();
        harness.StartPromptPhaseWithPlayers(3);
        harness.JoinPlayer("c4", "p4", "Late Player");
        harness.Game.Disconnect("c4");

        var state = harness.JoinPlayer("c4-new-browser", "brand-new-id", "late player");

        Assert.False(state.IsCurrentPlayerActive);
        Assert.False(state.Players.Single(p => p.Id == "p4").IsActive);
        Assert.Equal(PlayerPhaseStatus.Waiting, state.Players.Single(p => p.Id == "p4").PhaseStatus);
    }

    [Fact]
    public void HostDisconnectReassignsHostToEarliestConnectedPlayer()
    {
        var harness = new GameTestHarness();
        harness.JoinPlayers(3);

        var state = harness.Game.Disconnect("c1");

        Assert.Equal("p2", state.HostPlayerId);
    }

    [Fact]
    public void ReconnectingOriginalHostRestoresHostByJoinOrder()
    {
        var harness = new GameTestHarness();
        harness.JoinPlayers(3);
        harness.Game.Disconnect("c1");

        var state = harness.JoinPlayer("c1-reconnected", "p1", "Player 1");

        Assert.Equal("p1", state.HostPlayerId);
    }

    [Fact]
    public void ReconnectingEarliestPlayerAfterEveryoneDisconnectsRestoresHost()
    {
        var harness = new GameTestHarness();
        harness.JoinPlayers(3);
        harness.Game.Disconnect("c1");
        harness.Game.Disconnect("c2");
        harness.Game.Disconnect("c3");

        var state = harness.JoinPlayer("c1-reconnected", "p1", "Player 1");

        Assert.Equal("p1", state.HostPlayerId);
    }

    [Fact]
    public void LaterReconnectBecomesHostUntilEarlierEligiblePlayerReconnects()
    {
        var harness = new GameTestHarness();
        harness.JoinPlayers(3);
        harness.Game.Disconnect("c1");
        harness.Game.Disconnect("c2");
        harness.Game.Disconnect("c3");

        var p3State = harness.JoinPlayer("c3-reconnected", "p3", "Player 3");
        Assert.Equal("p3", p3State.HostPlayerId);

        var p2State = harness.JoinPlayer("c2-reconnected", "p2", "Player 2");
        Assert.Equal("p2", p2State.HostPlayerId);

        var p1State = harness.JoinPlayer("c1-reconnected", "p1", "Player 1");
        Assert.Equal("p1", p1State.HostPlayerId);
    }
}
