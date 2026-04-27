namespace BriberyGame.Api.Models;

public class Game
{
    public GameState State { get; }

    public Game(string gameId)
    {
        State = new GameState
        {
            GameId = gameId
        };
    }

    public LobbyStateDto Join(string connectionId, string playerId, string name)
    {
        if (State.Phase != GamePhase.Lobby)
            return BuildState();

        if (State.Players.Any(p => p.ConnectionId == connectionId))
            return BuildState();

        var existing = State.Players.FirstOrDefault(p => p.Id == playerId);

        if (existing != null)
        {
            existing.ConnectionId = connectionId;
            existing.Connected = true;
            existing.IsReady = false;
            return BuildState();
        }

        var player = new Player
        {
            Id = playerId,
            Name = name,
            Connected = true,
            ConnectionId = connectionId,
            IsReady = false
        };

        State.Players.Add(player);

        if (State.HostPlayerId == null)
        {
            State.HostPlayerId = player.Id;
        }

        return BuildState();
    }

    public LobbyStateDto Disconnect(string connectionId)
    {
        var player = State.Players.FirstOrDefault(p => p.ConnectionId == connectionId);

        if (player != null)
        {
            player.Connected = false;

            if (player.Id == State.HostPlayerId)
            {
                var nextHost = State.Players.FirstOrDefault(p => p.Connected);
                State.HostPlayerId = nextHost?.Id;
            }
        }

        return BuildState();
    }

    public Result<LobbyStateDto> ToggleReady(string connectionId)
    {
        if (State.Phase != GamePhase.Lobby)
            return Result<LobbyStateDto>.Fail("Cannot toggle ready outside lobby");

        var player = State.Players.FirstOrDefault(p => p.ConnectionId == connectionId);
        if (player == null)
            return Result<LobbyStateDto>.Fail("Player not found");

        player.IsReady = !player.IsReady;

        return Result<LobbyStateDto>.Ok(BuildState());
    }

    public bool CanStart()
    {
        return State.Players
            .Where(p => p.Connected)
            .All(p => p.IsReady);
    }

    public Result<LobbyStateDto> StartGame(string connectionId)
    {
        if (State.Phase != GamePhase.Lobby)
            return Result<LobbyStateDto>.Fail("Cannot start game outside lobby");
        
        var player = State.Players.FirstOrDefault(p => p.ConnectionId == connectionId);

        if (player == null || player.Id != State.HostPlayerId)
            return Result<LobbyStateDto>.Fail("Player is not host and cannot start game");

        if (!CanStart())
            return Result<LobbyStateDto>.Fail("Cannot start game before all players are ready");;

        State.Phase = GamePhase.InGame;

        return Result<LobbyStateDto>.Ok(BuildState());
    }

    private LobbyStateDto BuildState()
    {
        return new LobbyStateDto
        {
            Players = State.Players,
            HostPlayerId = State.HostPlayerId,
            Phase = State.Phase
        };
    }
}