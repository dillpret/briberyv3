namespace BriberyGame.Api.Models;

public class BribeMedia
{
    public string MediaId { get; set; } = "";
    public string Url { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long ByteSize { get; set; }
}
