namespace BriberyGame.Api.Models;

public class Game
{
    private const int MaxPromptLength = 200;

    private static readonly IReadOnlyDictionary<GamePhase, GamePhase[]> AllowedTransitions =
        new Dictionary<GamePhase, GamePhase[]>
        {
            [GamePhase.Lobby] = [GamePhase.Prompt],
            [GamePhase.Prompt] = [GamePhase.Submission],
        };

    public GameState State { get; }

    public Game(string gameId)
    {
        State = new GameState
        {
            GameId = gameId
        };
    }

    public GameStateDto Join(string connectionId, string playerId, string name)
    {
        // Prevent duplicate connection join
        if (State.Players.Any(p => p.ConnectionId == connectionId))
            return BuildState();

        var existing = State.Players.FirstOrDefault(p => p.Id == playerId);

        // --- RECONNECT CASE ---
        if (existing != null)
        {
            existing.ConnectionId = connectionId;
            existing.Connected = true;

            // Reset readiness always
            existing.IsReady = false;

            // Critical: decide activity based on phase
            if (State.Phase == GamePhase.Lobby)
            {
                existing.IsActive = true;
            }
            // else: keep whatever it was (usually false if they joined mid-game)

            return BuildState();
        }

        // --- NEW PLAYER CASE ---
        var player = new Player
        {
            Id = playerId,
            Name = name,
            Connected = true,
            ConnectionId = connectionId,
            IsReady = false,
            IsActive = State.Phase == GamePhase.Lobby
        };

        State.Players.Add(player);

        // Assign host if first player
        if (State.HostPlayerId == null)
        {
            State.HostPlayerId = player.Id;
        }

        return BuildState();
    }

    public GameStateDto Disconnect(string connectionId)
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

    public Result<GameStateDto> ToggleReady(string connectionId)
    {
        var phaseResult = RequirePhase(GamePhase.Lobby, "Cannot toggle ready outside lobby");
        if (!phaseResult.Success)
            return Result<GameStateDto>.Fail(phaseResult.Error!);

        var player = State.Players.FirstOrDefault(p => p.ConnectionId == connectionId);
        if (player == null)
            return Result<GameStateDto>.Fail("Player not found");

        player.IsReady = !player.IsReady;

        return Result<GameStateDto>.Ok(BuildState());
    }

    public bool CanStart()
    {
        return State.Players
            .Where(p => p.Connected)
            .All(p => p.IsReady);
    }

    public Result<GameStateDto> StartGame(string connectionId)
    {
        var phaseResult = RequirePhase(GamePhase.Lobby, "Cannot start game outside lobby");
        if (!phaseResult.Success)
            return Result<GameStateDto>.Fail(phaseResult.Error!);
        
        var player = State.Players.FirstOrDefault(p => p.ConnectionId == connectionId);

        if (player == null || player.Id != State.HostPlayerId)
            return Result<GameStateDto>.Fail("Player is not host and cannot start game");

        if (!CanStart())
            return Result<GameStateDto>.Fail("Cannot start game before all players are ready");

        State.CurrentRound = 1;
        State.Prompts.Clear();

        foreach (var activePlayer in State.Players)
        {
            activePlayer.IsActive = true;
            activePlayer.IsReady = false;
        }

        var transitionResult = TransitionTo(GamePhase.Prompt);
        if (!transitionResult.Success)
            return Result<GameStateDto>.Fail(transitionResult.Error!);

        return Result<GameStateDto>.Ok(BuildState());
    }

    public Result<GameStateDto> SubmitPrompt(string connectionId, string text)
    {
        var phaseResult = RequirePhase(GamePhase.Prompt, "Cannot submit prompt outside prompt phase");
        if (!phaseResult.Success)
            return Result<GameStateDto>.Fail(phaseResult.Error!);

        var player = State.Players.FirstOrDefault(p => p.ConnectionId == connectionId);
        if (player == null)
            return Result<GameStateDto>.Fail("Player not found");

        if (!player.IsActive)
            return Result<GameStateDto>.Fail("Inactive players cannot submit prompts");

        var promptText = text.Trim();

        if (promptText.Length == 0)
            return Result<GameStateDto>.Fail("Prompt cannot be empty");

        if (promptText.Length > MaxPromptLength)
            return Result<GameStateDto>.Fail($"Prompt cannot exceed {MaxPromptLength} characters");

        if (State.Prompts.ContainsKey(player.Id))
            return Result<GameStateDto>.Fail("Prompt has already been submitted");

        State.Prompts[player.Id] = new PromptSubmission
        {
            PlayerId = player.Id,
            Text = promptText,
            SubmittedAt = DateTimeOffset.UtcNow
        };

        if (AllActivePlayersSubmittedPrompts())
        {
            var transitionResult = TransitionTo(GamePhase.Submission);
            if (!transitionResult.Success)
                return Result<GameStateDto>.Fail(transitionResult.Error!);
        }

        return Result<GameStateDto>.Ok(BuildState());
    }

    private Result<object> RequirePhase(GamePhase expectedPhase, string error)
    {
        return State.Phase == expectedPhase
            ? Result<object>.Ok(new object())
            : Result<object>.Fail(error);
    }

    private Result<object> TransitionTo(GamePhase nextPhase)
    {
        if (!AllowedTransitions.TryGetValue(State.Phase, out var allowedNextPhases) ||
            !allowedNextPhases.Contains(nextPhase))
        {
            return Result<object>.Fail($"Cannot transition from {State.Phase} to {nextPhase}");
        }

        State.Phase = nextPhase;
        return Result<object>.Ok(new object());
    }

    private bool AllActivePlayersSubmittedPrompts()
    {
        var activePlayerIds = State.Players
            .Where(p => p.IsActive)
            .Select(p => p.Id)
            .ToHashSet();

        return activePlayerIds.Count > 0 &&
               activePlayerIds.All(State.Prompts.ContainsKey);
    }

    private GameStateDto BuildState()
    {
        var activePlayerIds = State.Players
            .Where(p => p.IsActive)
            .Select(p => p.Id)
            .ToHashSet();

        var submittedPromptOwnerIds = State.Prompts.Keys
            .Where(activePlayerIds.Contains)
            .ToList();

        return new GameStateDto
        {
            Players = State.Players.Select(p => new Player
            {
                Id = p.Id,
                Name = p.Name,
                Connected = p.Connected,
                ConnectionId = p.ConnectionId,
                IsReady = p.IsReady,
                IsActive = p.IsActive
            }).ToList(),
            HostPlayerId = State.HostPlayerId,
            Phase = State.Phase,
            CurrentRound = State.CurrentRound,
            TotalRounds = State.TotalRounds,
            PromptSubmittedCount = submittedPromptOwnerIds.Count,
            PromptRequiredCount = activePlayerIds.Count,
            SubmittedPromptOwnerIds = submittedPromptOwnerIds
        };
    }
}
