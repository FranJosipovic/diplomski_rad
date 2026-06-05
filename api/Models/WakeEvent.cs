namespace api.Models;

// Buđenje aktuatorskog uređaja iz deep sleepa (Mod 2/3).
// Uređaj publisha na navodnjavanje/pumpa/wake pri svakom wakeupu.
public class WakeEvent
{
    public int Id { get; set; }
    public int SesijaId { get; set; }
    public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;

    public Sesija Sesija { get; set; } = null!;
}
