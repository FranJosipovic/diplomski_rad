namespace api.Models;

public class EventPumpe
{
    public int Id { get; set; }
    public int SesijaId { get; set; }
    public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;
    public bool Status { get; set; }

    public Sesija Sesija { get; set; } = null!;
}
