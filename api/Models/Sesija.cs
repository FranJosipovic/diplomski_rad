namespace api.Models;

public class Sesija
{
    public int Id { get; set; }
    public int ModId { get; set; }
    public decimal Threshold { get; set; }
    public int? IntervalMinuta { get; set; }
    public int? IntervalPaljenja { get; set; }
    public int? TrajanjePaljenja { get; set; }
    public DateTimeOffset Pocetak { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? Kraj { get; set; }
    public string? Napomena { get; set; }

    public Mod Mod { get; set; } = null!;
    public ICollection<Ocitavanje> Ocitavanja { get; set; } = [];
    public ICollection<EventPumpe> EventiPumpe { get; set; } = [];
}
