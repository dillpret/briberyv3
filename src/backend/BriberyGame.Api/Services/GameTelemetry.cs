namespace BriberyGame.Api.Services;

using System.Diagnostics.Metrics;
using BriberyGame.Api.Models;

public sealed class GameTelemetry
{
    public const string MeterName = "BriberyGame";

    private readonly Counter<long> _gamesCreated;
    private readonly Counter<long> _gamesStarted;
    private readonly Counter<long> _playersJoined;
    private readonly Counter<long> _playersReconnected;
    private readonly Counter<long> _roundsCompleted;
    private readonly Counter<long> _phaseTransitions;
    private readonly Counter<long> _actionFailures;
    private readonly Counter<long> _mediaUploads;
    private readonly Histogram<long> _mediaUploadBytes;
    private int _activeGames;
    private int _activePlayers;

    public GameTelemetry(IMeterFactory meterFactory)
    {
        var meter = meterFactory.Create(MeterName);

        _gamesCreated = meter.CreateCounter<long>("bribery_games_created_total");
        _gamesStarted = meter.CreateCounter<long>("bribery_games_started_total");
        _playersJoined = meter.CreateCounter<long>("bribery_players_joined_total");
        _playersReconnected = meter.CreateCounter<long>("bribery_players_reconnected_total");
        _roundsCompleted = meter.CreateCounter<long>("bribery_rounds_completed_total");
        _phaseTransitions = meter.CreateCounter<long>("bribery_phase_transitions_total");
        _actionFailures = meter.CreateCounter<long>("bribery_action_failures_total");
        _mediaUploads = meter.CreateCounter<long>("bribery_media_uploads_total");
        _mediaUploadBytes = meter.CreateHistogram<long>("bribery_media_upload_bytes");

        meter.CreateObservableGauge(
            "bribery_active_games",
            () => Volatile.Read(ref _activeGames));

        meter.CreateObservableGauge(
            "bribery_active_players",
            () => Volatile.Read(ref _activePlayers));
    }

    public void UpdateActiveCounts(int activeGames, int activePlayers)
    {
        Volatile.Write(ref _activeGames, activeGames);
        Volatile.Write(ref _activePlayers, activePlayers);
    }

    public void GameCreated(string country)
    {
        _gamesCreated.Add(1, CountryTag(country));
    }

    public void GameStarted(int activePlayers, string country)
    {
        _gamesStarted.Add(
            1,
            CountryTag(country),
            new KeyValuePair<string, object?>("active_players", activePlayers));
    }

    public void PlayerJoined(string country)
    {
        _playersJoined.Add(1, CountryTag(country));
    }

    public void PlayerReconnected(string country)
    {
        _playersReconnected.Add(1, CountryTag(country));
    }

    public void PhaseTransition(GamePhase from, GamePhase to, int activePlayers)
    {
        _phaseTransitions.Add(
            1,
            new KeyValuePair<string, object?>("from_phase", from.ToString()),
            new KeyValuePair<string, object?>("to_phase", to.ToString()),
            new KeyValuePair<string, object?>("active_players", activePlayers));
    }

    public void RoundCompleted(int round, int activePlayers)
    {
        _roundsCompleted.Add(
            1,
            new KeyValuePair<string, object?>("round", round),
            new KeyValuePair<string, object?>("active_players", activePlayers));
    }

    public void ActionFailed(string action)
    {
        _actionFailures.Add(1, new KeyValuePair<string, object?>("action", action));
    }

    public void MediaUploaded(long bytes, string contentType)
    {
        var contentTypeTag = new KeyValuePair<string, object?>("content_type", NormalizeContentType(contentType));

        _mediaUploads.Add(1, contentTypeTag);
        _mediaUploadBytes.Record(bytes, contentTypeTag);
    }

    private static KeyValuePair<string, object?> CountryTag(string country)
    {
        return new KeyValuePair<string, object?>("country", NormalizeCountry(country));
    }

    private static string NormalizeCountry(string country)
    {
        return string.IsNullOrWhiteSpace(country)
            ? "unknown"
            : country.Trim().ToUpperInvariant();
    }

    private static string NormalizeContentType(string contentType)
    {
        return string.IsNullOrWhiteSpace(contentType)
            ? "unknown"
            : contentType.Trim().ToLowerInvariant();
    }
}
