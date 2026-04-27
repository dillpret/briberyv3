namespace BriberyGame.Api.Models;

public class Game
{
    private const int MaxPromptLength = 200;
    private const int MaxBribeLength = 500;
    private const int TargetsPerPlayer = 2;

    private static readonly IReadOnlyDictionary<GamePhase, GamePhase[]> AllowedTransitions =
        new Dictionary<GamePhase, GamePhase[]>
        {
            [GamePhase.Lobby] = [GamePhase.Prompt],
            [GamePhase.Prompt] = [GamePhase.Submission],
            [GamePhase.Submission] = [GamePhase.Voting],
            [GamePhase.Voting] = [GamePhase.Results],
            [GamePhase.Results] = [GamePhase.Prompt],
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
        if (State.Players.FirstOrDefault(p => p.ConnectionId == connectionId) is { } alreadyConnected)
            return BuildStateForPlayer(alreadyConnected.Id);

        var existing = State.Players.FirstOrDefault(p => p.Id == playerId);

        if (existing != null)
        {
            existing.ConnectionId = connectionId;
            existing.Connected = true;
            existing.IsReady = false;

            if (State.Phase == GamePhase.Lobby)
                existing.IsActive = true;

            return BuildStateForPlayer(existing.Id);
        }

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

        if (State.HostPlayerId == null)
            State.HostPlayerId = player.Id;

        return BuildStateForPlayer(player.Id);
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

        return BuildStateForPlayer(player?.Id ?? "");
    }

    public Result<GameStateDto> ToggleReady(string connectionId)
    {
        var phaseResult = RequirePhase(GamePhase.Lobby, "Cannot toggle ready outside lobby");
        if (!phaseResult.Success)
            return Result<GameStateDto>.Fail(phaseResult.Error!);

        var player = FindPlayerByConnection(connectionId);
        if (player == null)
            return Result<GameStateDto>.Fail("Player not found");

        player.IsReady = !player.IsReady;

        return Result<GameStateDto>.Ok(BuildStateForPlayer(player.Id));
    }

    public Result<GameStateDto> StartGame(string connectionId)
    {
        var phaseResult = RequirePhase(GamePhase.Lobby, "Cannot start game outside lobby");
        if (!phaseResult.Success)
            return Result<GameStateDto>.Fail(phaseResult.Error!);

        var player = FindPlayerByConnection(connectionId);

        if (player == null || player.Id != State.HostPlayerId)
            return Result<GameStateDto>.Fail("Player is not host and cannot start game");

        if (!CanStart())
            return Result<GameStateDto>.Fail("Cannot start game before at least three connected players are ready");

        State.CurrentRound = 1;
        ClearRoundState();

        foreach (var activePlayer in State.Players.Where(p => p.Connected))
        {
            activePlayer.IsActive = true;
            activePlayer.IsReady = false;
            activePlayer.Score = 0;
        }

        var transitionResult = TransitionTo(GamePhase.Prompt);
        if (!transitionResult.Success)
            return Result<GameStateDto>.Fail(transitionResult.Error!);

        return Result<GameStateDto>.Ok(BuildStateForPlayer(player.Id));
    }

    public Result<GameStateDto> SubmitPrompt(string connectionId, string text)
    {
        var phaseResult = RequirePhase(GamePhase.Prompt, "Cannot submit prompt outside prompt phase");
        if (!phaseResult.Success)
            return Result<GameStateDto>.Fail(phaseResult.Error!);

        var player = FindPlayerByConnection(connectionId);
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
            GenerateTargetAssignments();

            var transitionResult = TransitionTo(GamePhase.Submission);
            if (!transitionResult.Success)
                return Result<GameStateDto>.Fail(transitionResult.Error!);
        }

        return Result<GameStateDto>.Ok(BuildStateForPlayer(player.Id));
    }

    public Result<GameStateDto> SubmitBribe(string connectionId, string targetPlayerId, string text)
    {
        var phaseResult = RequirePhase(GamePhase.Submission, "Cannot submit bribe outside submission phase");
        if (!phaseResult.Success)
            return Result<GameStateDto>.Fail(phaseResult.Error!);

        var player = FindPlayerByConnection(connectionId);
        if (player == null)
            return Result<GameStateDto>.Fail("Player not found");

        if (!player.IsActive)
            return Result<GameStateDto>.Fail("Inactive players cannot submit bribes");

        if (!State.TargetAssignments.TryGetValue(player.Id, out var targets) ||
            !targets.Contains(targetPlayerId))
            return Result<GameStateDto>.Fail("Cannot submit a bribe to an unassigned target");

        var bribeText = text.Trim();

        if (bribeText.Length == 0)
            return Result<GameStateDto>.Fail("Bribe cannot be empty");

        if (bribeText.Length > MaxBribeLength)
            return Result<GameStateDto>.Fail($"Bribe cannot exceed {MaxBribeLength} characters");

        if (State.Bribes.Values.Any(b => b.FromPlayerId == player.Id && b.ToPlayerId == targetPlayerId))
            return Result<GameStateDto>.Fail("Bribe has already been submitted for this target");

        var bribeId = Guid.NewGuid().ToString("N");

        State.Bribes[bribeId] = new BribeSubmission
        {
            Id = bribeId,
            FromPlayerId = player.Id,
            ToPlayerId = targetPlayerId,
            Text = bribeText,
            SubmittedAt = DateTimeOffset.UtcNow
        };

        if (AllRequiredBribesSubmitted())
        {
            var transitionResult = TransitionTo(GamePhase.Voting);
            if (!transitionResult.Success)
                return Result<GameStateDto>.Fail(transitionResult.Error!);
        }

        return Result<GameStateDto>.Ok(BuildStateForPlayer(player.Id));
    }

    public Result<GameStateDto> SubmitVote(string connectionId, string bribeId)
    {
        var phaseResult = RequirePhase(GamePhase.Voting, "Cannot submit vote outside voting phase");
        if (!phaseResult.Success)
            return Result<GameStateDto>.Fail(phaseResult.Error!);

        var player = FindPlayerByConnection(connectionId);
        if (player == null)
            return Result<GameStateDto>.Fail("Player not found");

        if (!player.IsActive)
            return Result<GameStateDto>.Fail("Inactive players cannot vote");

        if (State.Votes.ContainsKey(player.Id))
            return Result<GameStateDto>.Fail("Vote has already been submitted");

        if (!State.Bribes.TryGetValue(bribeId, out var bribe) || bribe.ToPlayerId != player.Id)
            return Result<GameStateDto>.Fail("Cannot vote for a bribe that was not sent to you");

        State.Votes[player.Id] = new VoteSubmission
        {
            VoterPlayerId = player.Id,
            BribeId = bribeId,
            SubmittedAt = DateTimeOffset.UtcNow
        };

        if (AllActivePlayersVoted())
        {
            ScoreRound();

            var transitionResult = TransitionTo(GamePhase.Results);
            if (!transitionResult.Success)
                return Result<GameStateDto>.Fail(transitionResult.Error!);
        }

        return Result<GameStateDto>.Ok(BuildStateForPlayer(player.Id));
    }

    public Result<GameStateDto> StartNextRound(string connectionId)
    {
        var phaseResult = RequirePhase(GamePhase.Results, "Cannot start next round outside results phase");
        if (!phaseResult.Success)
            return Result<GameStateDto>.Fail(phaseResult.Error!);

        var player = FindPlayerByConnection(connectionId);

        if (player == null || player.Id != State.HostPlayerId)
            return Result<GameStateDto>.Fail("Player is not host and cannot start the next round");

        State.CurrentRound += 1;
        ClearRoundState();

        foreach (var roundPlayer in State.Players)
        {
            roundPlayer.IsActive = true;
            roundPlayer.IsReady = false;
        }

        var transitionResult = TransitionTo(GamePhase.Prompt);
        if (!transitionResult.Success)
            return Result<GameStateDto>.Fail(transitionResult.Error!);

        return Result<GameStateDto>.Ok(BuildStateForPlayer(player.Id));
    }

    public List<ConnectionGameStateDto> GetConnectedPlayerStates()
    {
        return State.Players
            .Where(p => p.Connected)
            .Select(p => new ConnectionGameStateDto
            {
                ConnectionId = p.ConnectionId,
                State = BuildStateForPlayer(p.Id)
            })
            .ToList();
    }

    private bool CanStart()
    {
        var connectedPlayers = State.Players.Where(p => p.Connected).ToList();

        return connectedPlayers.Count >= 3 &&
               connectedPlayers.All(p => p.IsReady);
    }

    private Player? FindPlayerByConnection(string connectionId)
    {
        return State.Players.FirstOrDefault(p => p.ConnectionId == connectionId);
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

    private void ClearRoundState()
    {
        State.Prompts.Clear();
        State.TargetAssignments.Clear();
        State.Bribes.Clear();
        State.Votes.Clear();
        State.RoundResults.Clear();
    }

    private void GenerateTargetAssignments()
    {
        State.TargetAssignments.Clear();

        var activePlayers = State.Players
            .Where(p => p.IsActive)
            .OrderBy(p => p.Id)
            .ToList();

        for (var i = 0; i < activePlayers.Count; i++)
        {
            State.TargetAssignments[activePlayers[i].Id] =
            [
                activePlayers[(i + 1) % activePlayers.Count].Id,
                activePlayers[(i + 2) % activePlayers.Count].Id
            ];
        }
    }

    private bool AllActivePlayersSubmittedPrompts()
    {
        var activePlayerIds = GetActivePlayerIds();

        return activePlayerIds.Count > 0 &&
               activePlayerIds.All(State.Prompts.ContainsKey);
    }

    private bool AllRequiredBribesSubmitted()
    {
        return GetActivePlayerIds().Count * TargetsPerPlayer == State.Bribes.Count;
    }

    private bool AllActivePlayersVoted()
    {
        var activePlayerIds = GetActivePlayerIds();

        return activePlayerIds.Count > 0 &&
               activePlayerIds.All(State.Votes.ContainsKey);
    }

    private HashSet<string> GetActivePlayerIds()
    {
        return State.Players
            .Where(p => p.IsActive)
            .Select(p => p.Id)
            .ToHashSet();
    }

    private void ScoreRound()
    {
        State.RoundResults.Clear();

        foreach (var vote in State.Votes.Values)
        {
            var bribe = State.Bribes[vote.BribeId];
            var winner = State.Players.First(p => p.Id == bribe.FromPlayerId);
            var prompt = State.Prompts[bribe.ToPlayerId];

            winner.Score += 1;

            State.RoundResults.Add(new RoundResult
            {
                PromptOwnerPlayerId = bribe.ToPlayerId,
                PromptText = prompt.Text,
                WinningBribeId = bribe.Id,
                WinningBribeText = bribe.Text,
                WinningPlayerId = bribe.FromPlayerId
            });
        }
    }

    private GameStateDto BuildStateForPlayer(string playerId)
    {
        var activePlayerIds = GetActivePlayerIds();

        var state = new GameStateDto
        {
            Players = State.Players.Select(p => new PlayerDto
            {
                Id = p.Id,
                Name = p.Name,
                Connected = p.Connected,
                IsReady = p.IsReady,
                IsActive = p.IsActive,
                Score = p.Score
            }).ToList(),
            HostPlayerId = State.HostPlayerId,
            Phase = State.Phase,
            CurrentRound = State.CurrentRound,
            TotalRounds = State.TotalRounds,
            IsCurrentPlayerActive = activePlayerIds.Contains(playerId),
            PromptSubmittedCount = State.Prompts.Keys.Count(activePlayerIds.Contains),
            PromptRequiredCount = activePlayerIds.Count,
            BribeSubmittedCount = State.Bribes.Count,
            BribeRequiredCount = activePlayerIds.Count * TargetsPerPlayer,
            VoteSubmittedCount = State.Votes.Keys.Count(activePlayerIds.Contains),
            VoteRequiredCount = activePlayerIds.Count
        };

        state.Prompt = BuildPromptPhaseForPlayer(playerId);
        state.Submission = BuildSubmissionPhaseForPlayer(playerId);
        state.Voting = BuildVotingPhaseForPlayer(playerId);
        state.Results = BuildResultsPhase();

        return state;
    }

    private PromptPhaseDto? BuildPromptPhaseForPlayer(string playerId)
    {
        if (State.Phase != GamePhase.Prompt)
            return null;

        return new PromptPhaseDto
        {
            HasSubmittedPrompt = State.Prompts.ContainsKey(playerId)
        };
    }

    private SubmissionPhaseDto? BuildSubmissionPhaseForPlayer(string playerId)
    {
        if (State.Phase != GamePhase.Submission)
            return null;

        if (!State.TargetAssignments.TryGetValue(playerId, out var targetIds))
            return new SubmissionPhaseDto();

        return new SubmissionPhaseDto
        {
            Targets = targetIds
                .Select(targetId =>
                {
                    var target = State.Players.First(p => p.Id == targetId);

                    return new SubmissionTargetDto
                    {
                        PlayerId = target.Id,
                        Name = target.Name,
                        Prompt = State.Prompts[target.Id].Text
                    };
                })
                .ToList(),
            SubmittedTargetPlayerIds = State.Bribes.Values
                .Where(b => b.FromPlayerId == playerId)
                .Select(b => b.ToPlayerId)
                .ToList()
        };
    }

    private VotingPhaseDto? BuildVotingPhaseForPlayer(string playerId)
    {
        if (State.Phase != GamePhase.Voting)
            return null;

        return new VotingPhaseDto
        {
            Bribes = State.Bribes.Values
                .Where(b => b.ToPlayerId == playerId)
                .Select(b => new VotingBribeDto
                {
                    BribeId = b.Id,
                    Text = b.Text
                })
                .ToList(),
            SelectedBribeId = State.Votes.TryGetValue(playerId, out var vote)
                ? vote.BribeId
                : null
        };
    }

    private ResultsPhaseDto? BuildResultsPhase()
    {
        if (State.Phase != GamePhase.Results)
            return null;

        return new ResultsPhaseDto
        {
            RoundResults = State.RoundResults.Select(r =>
            {
                var promptOwner = State.Players.First(p => p.Id == r.PromptOwnerPlayerId);
                var winner = State.Players.First(p => p.Id == r.WinningPlayerId);

                return new RoundResultDto
                {
                    PromptOwnerPlayerId = r.PromptOwnerPlayerId,
                    PromptOwnerName = promptOwner.Name,
                    PromptText = r.PromptText,
                    WinningBribeText = r.WinningBribeText,
                    WinningPlayerId = r.WinningPlayerId,
                    WinningPlayerName = winner.Name
                };
            }).ToList()
        };
    }
}
