namespace BriberyGame.Api.Services;

using System.Collections.Concurrent;
using BriberyGame.Api.Models;

public class MediaStore
{
    public const long MaxMediaBytes = Game.MaxMediaBribeBytes;
    private static readonly TimeSpan OrphanTtl = TimeSpan.FromMinutes(15);

    private readonly ConcurrentDictionary<string, StoredMedia> _media = new();

    public Result<BribeMedia> Store(
        string gameId,
        string ownerPlayerId,
        string contentType,
        long byteSize,
        byte[] bytes)
    {
        CleanupExpiredOrphans();

        if (byteSize <= 0 || byteSize > MaxMediaBytes || bytes.Length != byteSize)
            return Result<BribeMedia>.Fail("Media bribe cannot exceed 8 MB");

        if (!IsAllowedContentType(contentType))
            return Result<BribeMedia>.Fail("Media bribe must be a supported image or GIF");

        var mediaId = Guid.NewGuid().ToString("N");
        var normalizedContentType = NormalizeContentType(contentType);

        _media[mediaId] = new StoredMedia
        {
            MediaId = mediaId,
            GameId = gameId,
            OwnerPlayerId = ownerPlayerId,
            ContentType = normalizedContentType,
            ByteSize = byteSize,
            Bytes = bytes,
            CreatedAt = DateTimeOffset.UtcNow
        };

        return Result<BribeMedia>.Ok(ToBribeMedia(mediaId, normalizedContentType, byteSize));
    }

    public Result<BribeMedia> ReserveForBribe(
        string gameId,
        string ownerPlayerId,
        BribeMedia media,
        long activeMediaBudgetBytes)
    {
        CleanupExpiredOrphans();

        if (!_media.TryGetValue(media.MediaId, out var stored))
            return Result<BribeMedia>.Fail("Uploaded media could not be found");

        if (stored.GameId != gameId || stored.OwnerPlayerId != ownerPlayerId)
            return Result<BribeMedia>.Fail("Uploaded media does not belong to this player");

        if (stored.IsReferenced)
            return Result<BribeMedia>.Fail("Uploaded media has already been submitted");

        if (ActiveSubmittedBytes(gameId) + stored.ByteSize > activeMediaBudgetBytes)
            return Result<BribeMedia>.Fail("This game has reached its current media limit");

        stored.IsReferenced = true;

        return Result<BribeMedia>.Ok(ToBribeMedia(stored.MediaId, stored.ContentType, stored.ByteSize));
    }

    public StoredMedia? Get(string mediaId)
    {
        CleanupExpiredOrphans();
        _media.TryGetValue(mediaId, out var media);
        return media;
    }

    public void Remove(string mediaId)
    {
        _media.TryRemove(mediaId, out _);
    }

    public void Remove(IEnumerable<string> mediaIds)
    {
        foreach (var mediaId in mediaIds)
            Remove(mediaId);
    }

    public void RemoveGameMedia(string gameId)
    {
        foreach (var mediaId in _media
                     .Where(pair => pair.Value.GameId == gameId)
                     .Select(pair => pair.Key)
                     .ToList())
        {
            Remove(mediaId);
        }
    }

    public int Count => _media.Count;

    public void CleanupExpiredOrphans(DateTimeOffset? now = null)
    {
        var cutoff = (now ?? DateTimeOffset.UtcNow) - OrphanTtl;

        foreach (var mediaId in _media
                     .Where(pair => !pair.Value.IsReferenced && pair.Value.CreatedAt < cutoff)
                     .Select(pair => pair.Key)
                     .ToList())
        {
            Remove(mediaId);
        }
    }

    public static bool IsAllowedContentType(string contentType)
    {
        return NormalizeContentType(contentType) is
            "image/jpeg" or
            "image/png" or
            "image/gif" or
            "image/webp" or
            "image/bmp";
    }

    private long ActiveSubmittedBytes(string gameId)
    {
        return _media.Values
            .Where(media => media.GameId == gameId && media.IsReferenced)
            .Sum(media => media.ByteSize);
    }

    private static BribeMedia ToBribeMedia(string mediaId, string contentType, long byteSize)
    {
        return new BribeMedia
        {
            MediaId = mediaId,
            Url = $"/api/media/{mediaId}",
            ContentType = contentType,
            ByteSize = byteSize
        };
    }

    private static string NormalizeContentType(string contentType)
    {
        return contentType.Trim().ToLowerInvariant();
    }
}

public class StoredMedia
{
    public string MediaId { get; set; } = "";
    public string GameId { get; set; } = "";
    public string OwnerPlayerId { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long ByteSize { get; set; }
    public byte[] Bytes { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; }
    public bool IsReferenced { get; set; }
}
