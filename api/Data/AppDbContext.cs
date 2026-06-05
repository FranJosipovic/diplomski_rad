using api.Models;
using Microsoft.EntityFrameworkCore;

namespace api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Mod> Modovi => Set<Mod>();
    public DbSet<Sesija> Sesije => Set<Sesija>();
    public DbSet<Ocitavanje> Ocitavanja => Set<Ocitavanje>();
    public DbSet<EventPumpe> EventiPumpe => Set<EventPumpe>();
    public DbSet<OcitavanjeBaterije> OcitavanjaBaterije => Set<OcitavanjeBaterije>();
    public DbSet<WakeEvent> WakeEventi => Set<WakeEvent>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<Mod>(e =>
        {
            e.ToTable("mod");
            e.Property(m => m.Naziv).HasMaxLength(50).IsRequired();
            e.HasData(
                new Mod { Id = 1, Naziv = "pull" },
                new Mod { Id = 2, Naziv = "push" },
                new Mod { Id = 3, Naziv = "timer" }
            );
        });

        model.Entity<Sesija>(e =>
        {
            e.ToTable("sesija");
            e.Property(s => s.Threshold).HasColumnType("decimal(5,2)");
            e.HasOne(s => s.Mod)
             .WithMany(m => m.Sesije)
             .HasForeignKey(s => s.ModId);
        });

        model.Entity<Ocitavanje>(e =>
        {
            e.ToTable("ocitavanje");
            e.Property(o => o.Vlaga).HasColumnType("decimal(5,2)");
            e.Property(o => o.Temperatura).HasColumnType("decimal(5,2)");
            e.HasOne(o => o.Sesija)
             .WithMany(s => s.Ocitavanja)
             .HasForeignKey(o => o.SesijaId);
        });

        model.Entity<EventPumpe>(e =>
        {
            e.ToTable("event_pumpe");
            e.HasOne(ep => ep.Sesija)
             .WithMany(s => s.EventiPumpe)
             .HasForeignKey(ep => ep.SesijaId);
        });

        model.Entity<OcitavanjeBaterije>(e =>
        {
            e.ToTable("ocitavanje_baterije");
            e.Property(o => o.Vin).HasColumnType("decimal(4,2)");
            e.HasOne(o => o.Sesija)
             .WithMany(s => s.OcitavanjaBaterije)
             .HasForeignKey(o => o.SesijaId);
        });

        model.Entity<WakeEvent>(e =>
        {
            e.ToTable("wake_event");
            e.HasOne(w => w.Sesija)
             .WithMany(s => s.WakeEventi)
             .HasForeignKey(w => w.SesijaId);
        });
    }
}
