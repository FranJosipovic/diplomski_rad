namespace api.Models;

public class OcitavanjeBaterije
{
    public int Id { get; set; }
    public int SesijaId { get; set; }
    public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;
    public decimal Vin { get; set; }
    public int Postotak { get; set; }

    public Sesija Sesija { get; set; } = null!;
}
