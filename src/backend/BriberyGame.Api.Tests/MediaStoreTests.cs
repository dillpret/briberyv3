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
    public void ReservedMediaReferenceIsIdempotentOnlyForSameReferenceKey()
    {
        var store = new MediaStore();
        var media = store.Store("TEST", "p1", "image/png", 10, new byte[10]).Data!;

        var first = store.ReserveForBribe("TEST", "p1", media, Game.MaxMediaBribeBytes, "bribe:p1:p2");
        var sameReference = store.ReserveForBribe("TEST", "p1", media, Game.MaxMediaBribeBytes, "bribe:p1:p2");
        var differentReference = store.ReserveForBribe("TEST", "p1", media, Game.MaxMediaBribeBytes, "bribe:p1:p3");

        Assert.True(first.Success, first.Error);
        Assert.True(sameReference.Success, sameReference.Error);
        Assert.False(differentReference.Success);
    }

    [Fact]
    public void DraftMediaIsReservedAndSurvivesOrphanCleanupUntilReleased()
    {
        var now = DateTimeOffset.UtcNow;
        var mediaStore = new MediaStore();
        var service = new GameService(mediaStore, () => now);
        var gameId = StartSubmissionGame(service);
        var target = StateFor(service, gameId, "c1").Submission!.Targets[0];
        var media = service.StoreMedia(gameId, "p1", "image/png", 10, new byte[10]).Data!;

        var draft = service.SaveBribeDraft("c1", new SaveBribeDraftRequest
        {
            TargetPlayerId = target.PlayerId,
            Media = media,
            ClientDraftVersion = 1
        });
        Assert.True(draft.result!.Success, draft.result.Error);

        mediaStore.Get(media.MediaId)!.CreatedAt = DateTimeOffset.UtcNow.AddMinutes(-16);
        mediaStore.CleanupExpiredOrphans();
        Assert.NotNull(service.GetMedia(media.MediaId));

        var textDraft = service.SaveBribeDraft("c1", new SaveBribeDraftRequest
        {
            TargetPlayerId = target.PlayerId,
            Text = "Switched to text",
            ClientDraftVersion = 2
        });
        Assert.True(textDraft.result!.Success, textDraft.result.Error);

        mediaStore.CleanupExpiredOrphans();
        Assert.Null(service.GetMedia(media.MediaId));
    }

    [Fact]
    public void SavingMediaDraftRejectsSpoofedOrCrossPlayerMedia()
    {
        var mediaStore = new MediaStore();
        var service = new GameService(mediaStore);
        var gameId = StartSubmissionGame(service);
        var target = StateFor(service, gameId, "c1").Submission!.Targets[0];
        var p2Media = service.StoreMedia(gameId, "p2", "image/png", 10, new byte[10]).Data!;

        var spoofed = service.SaveBribeDraft("c1", new SaveBribeDraftRequest
        {
            TargetPlayerId = target.PlayerId,
            Media = new BribeMedia
            {
                MediaId = "not-real",
                Url = "/api/media/not-real",
                ContentType = "image/png",
                ByteSize = 10
            },
            ClientDraftVersion = 1
        });
        var wrongOwner = service.SaveBribeDraft("c1", new SaveBribeDraftRequest
        {
            TargetPlayerId = target.PlayerId,
            Media = p2Media,
            ClientDraftVersion = 2
        });

        Assert.False(spoofed.result!.Success);
        Assert.False(wrongOwner.result!.Success);
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

        for (var i = 1; i <= 3; i++)
        {
            var result = service.SubmitAppreciationDone($"c{i}");
            Assert.True(result.result!.Success, result.result.Error);
        }

        Assert.NotNull(service.GetMedia(media.MediaId));
        Assert.True(service.StartNextRound("c1").result!.Success);
        Assert.Null(service.GetMedia(media.MediaId));
    }

    [Fact]
    public void InactiveRoomCleanupRemovesRoomAndAssociatedMediaAfterFifteenMinutes()
    {
        var now = DateTimeOffset.UtcNow;
        var mediaStore = new MediaStore();
        var service = new GameService(mediaStore, () => now);
        var gameId = service.CreateGame();

        Assert.True(service.Join(gameId, "c1", "p1", "Player 1").result!.Success);
        var media = service.StoreMedia(gameId, "p1", "image/png", 10, new byte[10]).Data!;

        service.Disconnect("c1");
        now = now.AddMinutes(15).AddTicks(1);

        service.CreateGame();

        Assert.Null(service.GetMedia(media.MediaId));
        Assert.Null(service.Join(gameId, "c1-new", "p1", "Player 1").result);
    }

    [Fact]
    public void InactiveRoomCleanupKeepsRoomBeforeFifteenMinutes()
    {
        var now = DateTimeOffset.UtcNow;
        var service = new GameService(new MediaStore(), () => now);
        var gameId = service.CreateGame();

        Assert.True(service.Join(gameId, "c1", "p1", "Player 1").result!.Success);
        service.Disconnect("c1");
        now = now.AddMinutes(14).AddSeconds(59);

        service.CreateGame();
        var rejoin = service.Join(gameId, "c1-new", "p1", "Player 1");

        Assert.True(rejoin.result!.Success, rejoin.result.Error);
    }

    [Fact]
    public void InactiveRoomCleanupKeepsConnectedRooms()
    {
        var now = DateTimeOffset.UtcNow;
        var service = new GameService(new MediaStore(), () => now);
        var gameId = service.CreateGame();

        Assert.True(service.Join(gameId, "c1", "p1", "Player 1").result!.Success);
        now = now.AddHours(1);

        service.CreateGame();
        var state = service.GetConnectedPlayerStates(gameId);

        Assert.Single(state);
        Assert.Equal("p1", state[0].State.CurrentPlayerId);
    }

    private static GameStateDto StateFor(GameService service, string gameId, string connectionId)
    {
        return service.GetConnectedPlayerStates(gameId)
            .Single(state => state.ConnectionId == connectionId)
            .State;
    }

    private static string StartSubmissionGame(GameService service)
    {
        var gameId = service.CreateGame();

        for (var i = 1; i <= 3; i++)
        {
            Assert.True(service.Join(gameId, $"c{i}", $"p{i}", $"Player {i}").result!.Success);
            Assert.True(service.ToggleReady($"c{i}").result!.Success);
        }

        Assert.True(service.StartGame("c1").result!.Success);

        for (var i = 1; i <= 3; i++)
            Assert.True(service.SubmitPrompt($"c{i}", $"Prompt {i}").result!.Success);

        return gameId;
    }
}
