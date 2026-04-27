namespace BriberyGame.Api.Tests;

using BriberyGame.Api.Models;

internal sealed class GameTestHarness
{
    public Game Game { get; } = new("TEST");

    public static string PlayerId(int number) => $"p{number}";
    public static string ConnectionId(int number) => $"c{number}";

    public void JoinPlayers(int count)
    {
        for (var i = 1; i <= count; i++)
        {
            Game.Join(ConnectionId(i), PlayerId(i), $"Player {i}");
        }
    }

    public void ReadyPlayers(int count)
    {
        for (var i = 1; i <= count; i++)
        {
            var result = Game.ToggleReady(ConnectionId(i));
            Assert.True(result.Success, result.Error);
        }
    }

    public void JoinAndReadyPlayers(int count)
    {
        JoinPlayers(count);
        ReadyPlayers(count);
    }

    public GameStateDto StartGame()
    {
        var result = Game.StartGame(ConnectionId(1));
        Assert.True(result.Success, result.Error);
        return result.Data!;
    }

    public void StartPromptPhaseWithPlayers(int count)
    {
        JoinAndReadyPlayers(count);
        StartGame();
    }

    public void SubmitPromptsForActivePlayers()
    {
        foreach (var player in ActivePlayers())
        {
            var result = Game.SubmitPrompt(player.ConnectionId, $"Prompt for {player.Id}");
            Assert.True(result.Success, result.Error);
        }
    }

    public void SubmitAllAssignedBribes()
    {
        foreach (var player in ActivePlayers())
        {
            var state = GetPlayerState(player.Id);
            Assert.NotNull(state.Submission);

            foreach (var target in state.Submission.Targets)
            {
                if (state.Submission.SubmittedTargetPlayerIds.Contains(target.PlayerId))
                    continue;

                var result = Game.SubmitBribe(
                    player.ConnectionId,
                    target.PlayerId,
                    $"Bribe from {player.Id} to {target.PlayerId}");

                Assert.True(result.Success, result.Error);
            }
        }
    }

    public void SubmitAllVotes()
    {
        foreach (var player in ActivePlayers())
        {
            var state = GetPlayerState(player.Id);
            Assert.NotNull(state.Voting);
            Assert.NotEmpty(state.Voting.Bribes);

            var result = Game.SubmitVote(player.ConnectionId, state.Voting.Bribes[0].BribeId);
            Assert.True(result.Success, result.Error);
        }
    }

    public void CompleteRoundToResults(int playerCount = 3)
    {
        StartPromptPhaseWithPlayers(playerCount);
        SubmitPromptsForActivePlayers();
        SubmitAllAssignedBribes();
        SubmitAllVotes();
        Assert.Equal(GamePhase.Results, Game.State.Phase);
    }

    public GameStateDto GetPlayerState(string playerId)
    {
        var connectionId = Game.State.Players.Single(p => p.Id == playerId).ConnectionId;

        var connectionState = Game.GetConnectedPlayerStates()
            .Single(s => s.ConnectionId == connectionId);

        return connectionState.State;
    }

    public GameStateDto GetStateForConnection(string connectionId)
    {
        var playerId = Game.State.Players.Single(p => p.ConnectionId == connectionId).Id;
        return GetPlayerState(playerId);
    }

    public List<Player> ActivePlayers()
    {
        return Game.State.Players
            .Where(p => p.IsActive)
            .OrderBy(p => p.Id)
            .ToList();
    }
}
