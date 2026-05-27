namespace api.Models;

public class Mod
{
    public int Id { get; set; }
    public string Naziv { get; set; } = string.Empty;

    public ICollection<Sesija> Sesije { get; set; } = [];
}
