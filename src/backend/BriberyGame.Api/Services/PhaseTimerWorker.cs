namespace BriberyGame.Api.Services;

using BriberyGame.Api.Hubs;
using Microsoft.AspNetCore.SignalR;

public class PhaseTimerWorker : BackgroundService
{
    private readonly GameService _gameService;
    private readonly IHubContext<GameHub> _hubContext;
    private readonly TimeProvider _timeProvider;

    public PhaseTimerWorker(
        GameService gameService,
        IHubContext<GameHub> hubContext,
        TimeProvider timeProvider)
    {
        _gameService = gameService;
        _hubContext = hubContext;
        _timeProvider = timeProvider;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(500));

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            var changedGameIds = _gameService.ExpireDuePhases(_timeProvider.GetUtcNow());

            foreach (var gameId in changedGameIds)
                await SendGameStateUpdates(gameId, stoppingToken);
        }
    }

    private async Task SendGameStateUpdates(string gameId, CancellationToken cancellationToken)
    {
        var states = _gameService.GetConnectedPlayerStates(gameId);

        foreach (var state in states)
        {
            await _hubContext.Clients.Client(state.ConnectionId)
                .SendAsync("GameStateUpdated", state.State, cancellationToken);
        }
    }
}
