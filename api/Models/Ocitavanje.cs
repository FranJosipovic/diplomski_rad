namespace api.Models;

public class Ocitavanje
{
    public int Id { get; set; }
    public int SesijaId { get; set; }
    public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;
    public decimal Vlaga { get; set; }
    public decimal Temperatura { get; set; }

    public Sesija Sesija { get; set; } = null!;
}
