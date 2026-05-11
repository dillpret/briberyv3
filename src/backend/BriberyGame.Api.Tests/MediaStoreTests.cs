namespace BriberyGame.Api.Tests;

using BriberyGame.Api.Models;
using BriberyGame.Api.Services;

public class MediaStoreTests
{
    [Fact]
    public void StoreRejectsUnsupportedTypesAndOversizedFiles()
    {
        var store = new MediaStore();

        var unsupported = store.Store("TEST", "p1", "image/svg+xml", 10, new byte[10]);
        var oversized = store.Store(
            "TEST",
            "p1",
            "image/png",
            MediaStore.MaxMediaBytes + 1,
            new byte[(int)MediaStore.MaxMediaBytes + 1]);

        Assert.False(unsupported.Success);
        Assert.False(oversized.Success);
    }

    [Fact]
    public void CleanupExpiredOrphansRemovesOnlyUnreferencedMedia()
    {
        var store = new MediaStore();
        var orphan = store.Store("TEST", "p1", "image/png", 10, new byte[10]).Data!;
        var referenced = store.Store("TEST", "p1", "image/gif", 12, new byte[12]).Data!;

        var reserve = store.ReserveForBribe(
            "TEST",
            "p1",
            referenced,
            Game.MaxMediaBribeBytes * 2);
        Assert.True(reserve.Success, reserve.Error);

        store.Get(orphan.MediaId)!.CreatedAt = DateTimeOffset.UtcNow.AddMinutes(-16);
        store.Get(referenced.MediaId)!.CreatedAt = DateTimeOffset.UtcNow.AddMinutes(-16);

        store.CleanupExpiredOrphans();

        Assert.Null(store.Get(orphan.MediaId));
        Assert.NotNull(store.Get(referenced.MediaId));
    }

    [Fact]
    public void StartingNextRoundRemovesReferencedRoundMedia()
    {
        var mediaStore = new MediaStore();
        var service = new GameService(mediaStore);
        var gameId = service.CreateGame();

        for (var i = 1; i <= 3; i++)
        {
            var join = service.Join(gameId, $"c{i}", $"p{i}", $"Player {i}");
            Assert.True(join.result!.Success, join.result.Error);

            var ready = service.ToggleReady($"c{i}");
            Assert.True(ready.result!.Success, ready.result.Error);
        }

        Assert.True(service.StartGame("c1").result!.Success);
        for (var i = 1; i <= 3; i++)
        {
            Assert.True(service.SubmitPrompt($"c{i}", $"Prompt {i}").result!.Success);
        }

        var p1State = StateFor(service, gameId, "c1");
        var target = p1State.Submission!.Targets[0];
        var media = service.StoreMedia(gameId, "p1", "image/png", 10, new byte[10]).Data!;
        var mediaBribe = service.SubmitBribe("c1", new SubmitBribeRequest
        {
            TargetPlayerId = target.PlayerId,
            Media = media
        });
        Assert.True(mediaBribe.result!.Success, mediaBribe.result.Error);

        for (var i = 1; i <= 3; i++)
        {
            var state = StateFor(service, gameId, $"c{i}");
            foreach (var submissionTarget in state.Submission?.Targets ?? [])
            {
                if (state.Submission!.SubmittedTargetPlayerIds.Contains(submissionTarget.PlayerId))
                    continue;

                var result = service.SubmitBribe(
                    $"c{i}",
                    submissionTarget.PlayerId,
                    $"Bribe from p{i}");
                Assert.True(result.result!.Success, result.result.Error);
            }
        }

        for (var i = 1; i <= 3; i++)
        {
            var state = StateFor(service, gameId, $"c{i}");
            var result = service.SubmitVote($"c{i}", state.Voting!.Bribes[0].BribeId);
            Assert.True(result.result!.Success, result.result.Error);
        }

        Assert.NotNull(service.GetMedia(media.MediaId));
        Assert.True(service.StartNextRound("c1").result!.Success);
        Assert.Null(service.GetMedia(media.MediaId));
    }

    private static GameStateDto StateFor(GameService service, string gameId, string connectionId)
    {
        return service.GetConnectedPlayerStates(gameId)
            .Single(state => state.ConnectionId == connectionId)
            .State;
    }
}
