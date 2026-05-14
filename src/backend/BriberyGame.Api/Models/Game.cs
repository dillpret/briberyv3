namespace BriberyGame.Api.Models;

public class Game
{
    private const int MaxPromptLength = 200;
    private const int MaxBribeLength = 500;
    public const long MaxMediaBribeBytes = 8 * 1024 * 1024;
    private const int TargetsPerPlayer = 2;
    private const int MinimumActivePlayers = 3;

    private static readonly IReadOnlyDictionary<GamePhase, GamePhase[]> AllowedTransitions =
        new Dictionary<GamePhase, GamePhase[]>
        {
            [GamePhase.Lobby] = [GamePhase.Prompt],
            [GamePhase.Prompt] = [GamePhase.Submission],
            [GamePhase.Submission] = [GamePhase.Voting],
            [GamePhase.Voting] = [GamePhase.Results],
            [GamePhase.Results] = [GamePhase.Prompt],
        };

    private static readonly GamePhase[] OfflineAdvancePhases =
    [
        GamePhase.Prompt,
        GamePhase.Submission,
        GamePhase.Voting
    ];

    public GameState State { get; }

    public Game(string gameId)
    {
        State = new GameState
        {
            GameId = gameId
        };
    }

    public Result<GameStateDto> Join(string connectionId, string playerId, string name)
    {
        if (State.Players.FirstOrDefault(p => p.ConnectionId == connectionId) is { } alreadyConnected)
            return Result<GameStateDto>.Ok(BuildStateForPlayer(alreadyConnected.Id));

        var trimmedName = name.Trim();
        var existing = State.Players.FirstOrDefault(p => p.Id == playerId);

        if (existing != null)
        {
            if (existing.Connected)
                return Result<GameStateDto>.Fail("You are currently active on a different device or browser.");

            return Result<GameStateDto>.Ok(ReconnectPlayer(existing, connectionId));
        }

        var nameMatch = State.Players.FirstOrDefault(p =>
            string.Equals(p.Name.Trim(), trimmedName, StringComparison.OrdinalIgnoreCase));

        if (nameMatch != null)
        {
            if (nameMatch.Connected)
                return Result<GameStateDto>.Fail("Another player with that name is already in the game. Please enter a different name.");

            return Result<GameStateDto>.Ok(ReconnectPlayer(nameMatch, connectionId));
        }

        var player = new Player
        {
            Id = playerId,
            Name = trimmedName,
            Connected = true,
            ConnectionId = connectionId,
            IsReady = false,
            IsActive = State.Phase == GamePhase.Lobby
        };

        State.Players.Add(player);

        if (State.HostPlayerId == null)
            State.HostPlayerId = player.Id;

        return Result<GameStateDto>.Ok(BuildStateForPlayer(player.Id));
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

            AdvancePhaseIfComplete();
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

    public Result<GameStateDto> AdvancePhaseWithoutOfflinePlayers(string connectionId)
    {
        if (!OfflineAdvancePhases.Contains(State.Phase))
            return Result<GameStateDto>.Fail("Cannot advance without offline players during this phase");

        var player = FindPlayerByConnection(connectionId);

        if (player == null || player.Id != State.HostPlayerId)
            return Result<GameStateDto>.Fail("Player is not host and cannot advance the phase");

        var blockingPlayers = GetOfflineBlockingPlayers();
        if (blockingPlayers.Count == 0)
            return Result<GameStateDto>.Fail("No offline players are blocking this phase");

        var remainingActiveConnectedPlayers = State.Players
            .Count(p => p.IsActive && p.Connected && blockingPlayers.All(blocker => blocker.Id != p.Id));

        if (remainingActiveConnectedPlayers < MinimumActivePlayers)
            return Result<GameStateDto>.Fail(
                $"Cannot advance without offline players because at least {MinimumActivePlayers} active connected players are required");

        foreach (var skippedPlayer in blockingPlayers)
        {
            skippedPlayer.IsActive = false;
            skippedPlayer.IsReady = false;
        }

        RemoveRoundDataForPlayers(blockingPlayers.Select(p => p.Id).ToHashSet());
        AdvancePhaseIfComplete();

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
        return SubmitBribe(connectionId, new SubmitBribeRequest
        {
            TargetPlayerId = targetPlayerId,
            Text = text
        });
    }

    public Result<GameStateDto> SubmitBribe(string connectionId, SubmitBribeRequest request)
    {
        var phaseResult = RequirePhase(GamePhase.Submission, "Cannot submit bribe outside submission phase");
        if (!phaseResult.Success)
            return Result<GameStateDto>.Fail(phaseResult.Error!);

        var player = FindPlayerByConnection(connectionId);
        if (player == null)
            return Result<GameStateDto>.Fail("Player not found");

        if (!player.IsActive)
            return Result<GameStateDto>.Fail("Inactive players cannot submit bribes");

        var targetPlayerId = request.TargetPlayerId;
        if (!State.TargetAssignments.TryGetValue(player.Id, out var targets) ||
            !targets.Contains(targetPlayerId))
            return Result<GameStateDto>.Fail("Cannot submit a bribe to an unassigned target");

        var bribeText = request.Text?.Trim() ?? "";
        var media = request.Media;
        var hasText = bribeText.Length > 0;
        var hasMedia = media != null;

        if (!hasText && !hasMedia)
            return Result<GameStateDto>.Fail("Bribe cannot be empty");

        if (hasText && hasMedia)
            return Result<GameStateDto>.Fail("Bribe must be either text or media, not both");

        if (hasText && bribeText.Length > MaxBribeLength)
            return Result<GameStateDto>.Fail($"Bribe cannot exceed {MaxBribeLength} characters");

        if (hasMedia)
        {
            if (media!.ByteSize <= 0 || media.ByteSize > MaxMediaBribeBytes)
                return Result<GameStateDto>.Fail("Media bribe cannot exceed 8 MB");

            if (!IsAllowedMediaContentType(media.ContentType))
                return Result<GameStateDto>.Fail("Media bribe must be a supported image or GIF");

            if (string.IsNullOrWhiteSpace(media.MediaId) || string.IsNullOrWhiteSpace(media.Url))
                return Result<GameStateDto>.Fail("Media bribe is missing upload information");
        }

        if (State.Bribes.Values.Any(b => b.FromPlayerId == player.Id && b.ToPlayerId == targetPlayerId))
            return Result<GameStateDto>.Fail("Bribe has already been submitted for this target");

        var bribeId = Guid.NewGuid().ToString("N");

        State.Bribes[bribeId] = new BribeSubmission
        {
            Id = bribeId,
            FromPlayerId = player.Id,
            ToPlayerId = targetPlayerId,
            Kind = hasMedia ? BribeContentKind.Media : BribeContentKind.Text,
            Text = bribeText,
            Media = media,
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

        if (State.Players.Count(p => p.Connected) < MinimumActivePlayers)
            return Result<GameStateDto>.Fail(
                $"Cannot start the next round before at least {MinimumActivePlayers} players are connected");

        State.CurrentRound += 1;
        ClearRoundState();

        foreach (var roundPlayer in State.Players)
        {
            roundPlayer.IsActive = roundPlayer.Connected;
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

    public bool HasConnection(string connectionId)
    {
        return State.Players.Any(p => p.ConnectionId == connectionId);
    }

    private GameStateDto ReconnectPlayer(Player player, string connectionId)
    {
        player.ConnectionId = connectionId;
        player.Connected = true;
        player.IsReady = false;

        if (State.Phase == GamePhase.Lobby)
            player.IsActive = true;

        return BuildStateForPlayer(player.Id);
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
        return GetRequiredBribeKeys().All(key => State.Bribes.Values.Any(b =>
            b.FromPlayerId == key.FromPlayerId &&
            b.ToPlayerId == key.ToPlayerId));
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

        var activePlayerIds = GetActivePlayerIds();

        foreach (var vote in State.Votes.Values.Where(v => activePlayerIds.Contains(v.VoterPlayerId)))
        {
            var bribe = State.Bribes[vote.BribeId];
            if (!activePlayerIds.Contains(bribe.FromPlayerId) || !activePlayerIds.Contains(bribe.ToPlayerId))
                continue;

            var winner = State.Players.First(p => p.Id == bribe.FromPlayerId);
            var prompt = State.Prompts[bribe.ToPlayerId];

            winner.Score += 1;

            State.RoundResults.Add(new RoundResult
            {
                PromptOwnerPlayerId = bribe.ToPlayerId,
                PromptText = prompt.Text,
                WinningBribeId = bribe.Id,
                WinningBribeKind = bribe.Kind,
                WinningBribeText = bribe.Text,
                WinningBribeMedia = bribe.Media,
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
                Score = p.Score,
                PhaseStatus = GetPhaseStatus(p),
                PhaseStatusLabel = GetPhaseStatusLabel(p)
            }).ToList(),
            CurrentPlayerId = playerId,
            HostPlayerId = State.HostPlayerId,
            Phase = State.Phase,
            CurrentRound = State.CurrentRound,
            TotalRounds = State.TotalRounds,
            IsCurrentPlayerActive = activePlayerIds.Contains(playerId),
            PromptSubmittedCount = State.Prompts.Keys.Count(activePlayerIds.Contains),
            PromptRequiredCount = activePlayerIds.Count,
            BribeSubmittedCount = GetSubmittedRequiredBribeCount(),
            BribeRequiredCount = GetRequiredBribeKeys().Count,
            VoteSubmittedCount = State.Votes.Keys.Count(activePlayerIds.Contains),
            VoteRequiredCount = activePlayerIds.Count
        };

        var offlineBlockingPlayers = GetOfflineBlockingPlayers();
        state.OfflineBlockingPlayerNames = offlineBlockingPlayers.Select(p => p.Name).ToList();
        state.CanHostAdvanceWithoutOfflinePlayers =
            offlineBlockingPlayers.Count > 0 &&
            State.Players.Count(p => p.IsActive && p.Connected) >= MinimumActivePlayers;
        state.AdvanceWithoutOfflinePlayersBlockedReason =
            offlineBlockingPlayers.Count > 0 && !state.CanHostAdvanceWithoutOfflinePlayers
                ? $"At least {MinimumActivePlayers} active connected players are required to continue."
                : null;

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
            PromptText = State.Prompts.TryGetValue(playerId, out var prompt)
                ? prompt.Text
                : "",
            Bribes = State.Bribes.Values
                .Where(b => b.ToPlayerId == playerId)
                .Select(b => new VotingBribeDto
                {
                    BribeId = b.Id,
                    Kind = b.Kind,
                    Text = b.Text,
                    Media = b.Media
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
                    WinningBribeKind = r.WinningBribeKind,
                    WinningBribeText = r.WinningBribeText,
                    WinningBribeMedia = r.WinningBribeMedia,
                    WinningPlayerId = r.WinningPlayerId,
                    WinningPlayerName = winner.Name
                };
            }).ToList()
        };
    }

    private PlayerPhaseStatus GetPhaseStatus(Player player)
    {
        if (!player.Connected)
            return PlayerPhaseStatus.None;

        if (!player.IsActive && State.Phase != GamePhase.Lobby)
            return PlayerPhaseStatus.Waiting;

        return State.Phase switch
        {
            GamePhase.Lobby => player.IsReady ? PlayerPhaseStatus.Ready : PlayerPhaseStatus.Pending,
            GamePhase.Prompt => State.Prompts.ContainsKey(player.Id)
                ? PlayerPhaseStatus.Done
                : PlayerPhaseStatus.Pending,
            GamePhase.Submission => HasSubmittedAllAssignedBribes(player)
                ? PlayerPhaseStatus.Done
                : PlayerPhaseStatus.Pending,
            GamePhase.Voting => State.Votes.ContainsKey(player.Id)
                ? PlayerPhaseStatus.Done
                : PlayerPhaseStatus.Pending,
            GamePhase.Results => PlayerPhaseStatus.Done,
            _ => PlayerPhaseStatus.None
        };
    }

    private string GetPhaseStatusLabel(Player player)
    {
        if (!player.Connected)
            return "Offline";

        if (!player.IsActive && State.Phase != GamePhase.Lobby)
            return "Waiting next round";

        return State.Phase switch
        {
            GamePhase.Lobby => player.IsReady ? "Ready" : "Not ready",
            GamePhase.Prompt => State.Prompts.ContainsKey(player.Id) ? "Submitted" : "Needs prompt",
            GamePhase.Submission => HasSubmittedAllAssignedBribes(player) ? "Submitted" : "Needs bribes",
            GamePhase.Voting => State.Votes.ContainsKey(player.Id) ? "Voted" : "Needs vote",
            GamePhase.Results => "Done",
            _ => ""
        };
    }

    private bool HasSubmittedAllAssignedBribes(Player player)
    {
        if (!player.IsActive)
            return false;

        if (!State.TargetAssignments.TryGetValue(player.Id, out var targets))
            return false;

        var submittedTargetIds = State.Bribes.Values
            .Where(b => b.FromPlayerId == player.Id)
            .Select(b => b.ToPlayerId)
            .ToHashSet();

        return targets.All(submittedTargetIds.Contains);
    }

    private void AdvancePhaseIfComplete()
    {
        if (State.Phase == GamePhase.Prompt && AllActivePlayersSubmittedPrompts())
        {
            GenerateTargetAssignments();
            TransitionTo(GamePhase.Submission);
            return;
        }

        if (State.Phase == GamePhase.Submission && AllRequiredBribesSubmitted())
        {
            TransitionTo(GamePhase.Voting);
            return;
        }

        if (State.Phase == GamePhase.Voting && AllActivePlayersVoted())
        {
            ScoreRound();
            TransitionTo(GamePhase.Results);
        }
    }

    private List<Player> GetOfflineBlockingPlayers()
    {
        if (!OfflineAdvancePhases.Contains(State.Phase))
            return [];

        return State.Players
            .Where(p => p.IsActive && !p.Connected && IsBlockingCurrentPhase(p))
            .OrderBy(p => p.Name)
            .ToList();
    }

    private bool IsBlockingCurrentPhase(Player player)
    {
        return State.Phase switch
        {
            GamePhase.Prompt => !State.Prompts.ContainsKey(player.Id),
            GamePhase.Submission => !HasSubmittedAllAssignedBribes(player),
            GamePhase.Voting => !State.Votes.ContainsKey(player.Id),
            _ => false
        };
    }

    private void RemoveRoundDataForPlayers(HashSet<string> playerIds)
    {
        foreach (var playerId in playerIds)
        {
            State.Prompts.Remove(playerId);
            State.TargetAssignments.Remove(playerId);
            State.Votes.Remove(playerId);
        }

        foreach (var playerId in State.Votes
                     .Where(v => playerIds.Contains(v.Value.VoterPlayerId))
                     .Select(v => v.Key)
                     .ToList())
        {
            State.Votes.Remove(playerId);
        }

        foreach (var bribeId in State.Bribes
                     .Where(b => playerIds.Contains(b.Value.FromPlayerId) ||
                                 playerIds.Contains(b.Value.ToPlayerId))
                     .Select(b => b.Key)
                     .ToList())
        {
            State.Bribes.Remove(bribeId);
        }

        foreach (var assignment in State.TargetAssignments.ToList())
        {
            if (playerIds.Contains(assignment.Key))
            {
                State.TargetAssignments.Remove(assignment.Key);
                continue;
            }

            assignment.Value.RemoveAll(playerIds.Contains);
        }

        RemoveInvalidVotes();
    }

    private void RemoveInvalidVotes()
    {
        foreach (var vote in State.Votes
                     .Where(v => !State.Bribes.ContainsKey(v.Value.BribeId))
                     .Select(v => v.Key)
                     .ToList())
        {
            State.Votes.Remove(vote);
        }
    }

    private List<RequiredBribeKey> GetRequiredBribeKeys()
    {
        var activePlayerIds = GetActivePlayerIds();

        return State.TargetAssignments
            .Where(assignment => activePlayerIds.Contains(assignment.Key))
            .SelectMany(assignment => assignment.Value
                .Where(activePlayerIds.Contains)
                .Distinct()
                .Select(targetId => new RequiredBribeKey(assignment.Key, targetId)))
            .ToList();
    }

    private int GetSubmittedRequiredBribeCount()
    {
        var required = GetRequiredBribeKeys().ToHashSet();

        return State.Bribes.Values
            .Count(bribe => required.Contains(new RequiredBribeKey(bribe.FromPlayerId, bribe.ToPlayerId)));
    }

    private static bool IsAllowedMediaContentType(string contentType)
    {
        return contentType.Equals("image/jpeg", StringComparison.OrdinalIgnoreCase) ||
               contentType.Equals("image/png", StringComparison.OrdinalIgnoreCase) ||
               contentType.Equals("image/gif", StringComparison.OrdinalIgnoreCase) ||
               contentType.Equals("image/webp", StringComparison.OrdinalIgnoreCase) ||
               contentType.Equals("image/bmp", StringComparison.OrdinalIgnoreCase);
    }

    private sealed record RequiredBribeKey(string FromPlayerId, string ToPlayerId);
}
