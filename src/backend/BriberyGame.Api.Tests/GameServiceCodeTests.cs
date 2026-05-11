namespace BriberyGame.Api.Tests;

using BriberyGame.Api.Services;

public class GameServiceCodeTests
{
    [Fact]
    public void JoinIsCaseInsensitive()
    {
        var service = new GameService();
        var gameId = service.CreateGame();

        var (resolvedGameId, result) = service.Join(
            gameId.ToLowerInvariant(),
            "c1",
            "p1",
            "Player 1");

        Assert.Equal(gameId, resolvedGameId);
        Assert.NotNull(result);
        Assert.True(result.Success, result.Error);
    }

    [Fact]
    public void JoinIgnoresLeadingAndTrailingWhitespace()
    {
        var service = new GameService();
        var gameId = service.CreateGame();

        var (resolvedGameId, result) = service.Join(
            $"  {gameId}  ",
            "c1",
            "p1",
            "Player 1");

        Assert.Equal(gameId, resolvedGameId);
        Assert.NotNull(result);
        Assert.True(result.Success, result.Error);
    }

    [Fact]
    public void UnknownNormalizedCodeFails()
    {
        var service = new GameService();

        var (resolvedGameId, result) = service.Join(
            " nope ",
            "c1",
            "p1",
            "Player 1");

        Assert.Null(resolvedGameId);
        Assert.Null(result);
    }

    [Fact]
    public void ConnectionRoutingUsesNormalizedGameId()
    {
        var service = new GameService();
        var gameId = service.CreateGame();
        service.Join($"  {gameId.ToLowerInvariant()}  ", "c1", "p1", "Player 1");

        var (disconnectGameId, state) = service.Disconnect("c1");

        Assert.Equal(gameId, disconnectGameId);
        Assert.NotNull(state);
    }
}
