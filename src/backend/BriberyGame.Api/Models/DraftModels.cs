namespace BriberyGame.Api.Models;

public class TextDraft
{
    public string Text { get; set; } = "";
    public long Version { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class BribeDraft
{
    public string Text { get; set; } = "";
    public BribeMedia? Media { get; set; }
    public long Version { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class VoteDraft
{
    public string BribeId { get; set; } = "";
    public long Version { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class SaveBribeDraftRequest
{
    public string TargetPlayerId { get; set; } = "";
    public string? Text { get; set; }
    public BribeMedia? Media { get; set; }
    public long ClientDraftVersion { get; set; }
}
