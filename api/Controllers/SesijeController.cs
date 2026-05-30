using api.Data;
using api.DTOs;
using api.Models;
using api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace api.Controllers;

[ApiController]
[Route("api/sesije")]
public class SesijeController(AppDbContext db, MqttService mqtt) : ControllerBase
{
    // GET /api/sesije
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var sesije = await db.Sesije
            .Include(s => s.Mod)
            .OrderByDescending(s => s.Pocetak)
            .Select(s => new
            {
                s.Id,
                mod = s.Mod.Naziv,
                s.ModId,
                s.Threshold,
                s.IntervalMinuta,
                s.IntervalPaljenja,
                s.TrajanjePaljenja,
                s.Pocetak,
                s.Kraj,
                s.Napomena,
                aktivna = s.Kraj == null
            })
            .ToListAsync();

        return Ok(sesije);
    }

    // GET /api/sesije/aktivna  — mora biti prije {id:int} rute
    [HttpGet("aktivna")]
    public async Task<IActionResult> GetAktivna()
    {
        var s = await db.Sesije
            .Include(s => s.Mod)
            .FirstOrDefaultAsync(s => s.Kraj == null);

        if (s is null) return NotFound();

        return Ok(new
        {
            s.Id,
            mod = s.Mod.Naziv,
            s.ModId,
            s.Threshold,
            s.IntervalMinuta,
            s.IntervalPaljenja,
            s.TrajanjePaljenja,
            s.Pocetak,
            s.Napomena
        });
    }

    // GET /api/sesije/{id}
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id)
    {
        var s = await db.Sesije
            .Include(s => s.Mod)
            .FirstOrDefaultAsync(s => s.Id == id);

        if (s is null) return NotFound();

        var ocitavanja = await db.Ocitavanja
            .Where(o => o.SesijaId == id)
            .OrderBy(o => o.Timestamp)
            .ToListAsync();

        var eventi = await db.EventiPumpe
            .Where(e => e.SesijaId == id)
            .OrderBy(e => e.Timestamp)
            .ToListAsync();

        // Agregatne statistike
        int total = ocitavanja.Count;
        int ispod = ocitavanja.Count(o => o.Vlaga < s.Threshold);
        double postoIspod = total > 0 ? (double)ispod * 100.0 / total : 0;
        double prosjecna = total > 0 ? (double)ocitavanja.Average(o => o.Vlaga) : 0;
        double minVlaga = total > 0 ? (double)ocitavanja.Min(o => o.Vlaga) : 0;
        double maxVlaga = total > 0 ? (double)ocitavanja.Max(o => o.Vlaga) : 0;

        // Trajanje pumpe: pari ON → OFF
        double sekundeUpaljeno = 0;
        int brPaljenja = 0;
        DateTimeOffset? onTime = null;
        foreach (var e in eventi)
        {
            if (e.Status && onTime is null) { onTime = e.Timestamp; brPaljenja++; }
            else if (!e.Status && onTime is not null) { sekundeUpaljeno += (e.Timestamp - onTime.Value).TotalSeconds; onTime = null; }
        }

        double trajanjeSek = s.Kraj.HasValue
            ? (s.Kraj.Value - s.Pocetak).TotalSeconds
            : (DateTimeOffset.UtcNow - s.Pocetak).TotalSeconds;

        return Ok(new
        {
            s.Id,
            mod = s.Mod.Naziv,
            s.ModId,
            s.Threshold,
            s.IntervalMinuta,
            s.IntervalPaljenja,
            s.TrajanjePaljenja,
            s.Pocetak,
            s.Kraj,
            s.Napomena,
            trajanjeSek = Math.Round(trajanjeSek, 0),
            prosjecnaVlaga = Math.Round(prosjecna, 2),
            minVlaga = Math.Round(minVlaga, 2),
            maxVlaga = Math.Round(maxVlaga, 2),
            postoIspodThresholda = Math.Round(postoIspod, 2),
            brPaljenja,
            sekundeUpaljeno = Math.Round(sekundeUpaljeno, 1)
        });
    }

    // GET /api/sesije/{id}/ocitavanja
    [HttpGet("{id:int}/ocitavanja")]
    public async Task<IActionResult> GetOcitavanja(int id)
    {
        var postoji = await db.Sesije.AnyAsync(s => s.Id == id);
        if (!postoji) return NotFound();

        var ocitavanja = await db.Ocitavanja
            .Where(o => o.SesijaId == id)
            .OrderBy(o => o.Timestamp)
            .Select(o => new { o.Timestamp, vlaga = (double)o.Vlaga, temperatura = (double)o.Temperatura })
            .ToListAsync();

        return Ok(ocitavanja);
    }

    // GET /api/sesije/{id}/baterija
    [HttpGet("{id:int}/baterija")]
    public async Task<IActionResult> GetBaterija(int id)
    {
        var postoji = await db.Sesije.AnyAsync(s => s.Id == id);
        if (!postoji) return NotFound();

        var baterija = await db.OcitavanjaBaterije
            .Where(b => b.SesijaId == id)
            .OrderBy(b => b.Timestamp)
            .Select(b => new { b.Timestamp, vin = (double)b.Vin, postotak = b.Postotak })
            .ToListAsync();

        return Ok(baterija);
    }

    // GET /api/sesije/{id}/eventi
    [HttpGet("{id:int}/eventi")]
    public async Task<IActionResult> GetEventi(int id)
    {
        var postoji = await db.Sesije.AnyAsync(s => s.Id == id);
        if (!postoji) return NotFound();

        var eventi = await db.EventiPumpe
            .Where(e => e.SesijaId == id)
            .OrderBy(e => e.Timestamp)
            .Select(e => new { e.Timestamp, e.Status })
            .ToListAsync();

        return Ok(eventi);
    }

    // POST /api/sesije/start
    [HttpPost("start")]
    public async Task<IActionResult> Start([FromBody] StartSesijaRequest req)
    {
        if (!mqtt.SenzoriReady || !mqtt.PumpaReady)
            return Conflict(new
            {
                error = "Uređaji nisu spremni.",
                senzori = mqtt.SenzoriReady,
                pumpa = mqtt.PumpaReady,
            });

        // Zatvori eventualno aktivnu sesiju
        var existing = await db.Sesije.FirstOrDefaultAsync(s => s.Kraj == null);
        if (existing is not null)
        {
            existing.Kraj = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
        }

        var sesija = new Sesija
        {
            ModId = req.ModId,
            Threshold = req.Threshold,
            IntervalMinuta = req.IntervalMinuta,
            IntervalPaljenja = req.IntervalPaljenja,
            TrajanjePaljenja = req.TrajanjePaljenja,
            Napomena = req.Napomena,
            Pocetak = DateTimeOffset.UtcNow
        };

        db.Sesije.Add(sesija);
        await db.SaveChangesAsync();

        // Publish retained MQTT config
        mqtt.CurrentThreshold = (float)req.Threshold;

        var inv = System.Globalization.CultureInfo.InvariantCulture;
        await mqtt.PublishAsync("navodnjavanje/config/threshold", req.Threshold.ToString("F2", inv), retain: true);
        await mqtt.PublishAsync("navodnjavanje/config/mod", req.ModId.ToString(), retain: true);

        if (req.ModId == 2 && req.IntervalMinuta.HasValue)
            await mqtt.PublishAsync("navodnjavanje/config/interval", req.IntervalMinuta.Value.ToString(), retain: true);

        if (req.ModId == 3)
        {
            var timer = JsonSerializer.Serialize(new
            {
                paljenjeMin = req.IntervalPaljenja ?? 60,
                trajanjeSek = req.TrajanjePaljenja ?? 30
            });
            await mqtt.PublishAsync("navodnjavanje/config/timer", timer, retain: true);
        }

        await mqtt.PublishAsync("navodnjavanje/sesija/status", "true", retain: true);

        return Ok(new { sesija.Id });
    }

    // DELETE /api/sesije/{id}
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var sesija = await db.Sesije.FindAsync(id);
        if (sesija is null) return NotFound();
        if (sesija.Kraj is null) return Conflict(new { error = "Ne možeš obrisati aktivnu sesiju. Prvo je zaustavi." });

        db.OcitavanjaBaterije.RemoveRange(db.OcitavanjaBaterije.Where(b => b.SesijaId == id));
        db.EventiPumpe.RemoveRange(db.EventiPumpe.Where(e => e.SesijaId == id));
        db.Ocitavanja.RemoveRange(db.Ocitavanja.Where(o => o.SesijaId == id));
        db.Sesije.Remove(sesija);
        await db.SaveChangesAsync();

        return Ok(new { deleted = id });
    }

    // PUT /api/sesije/{id}/stop
    [HttpPut("{id:int}/stop")]
    public async Task<IActionResult> Stop(int id)
    {
        var sesija = await db.Sesije.FindAsync(id);
        if (sesija is null) return NotFound();

        sesija.Kraj = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();

        await mqtt.PublishAsync("navodnjavanje/sesija/status", "false", retain: true);
        await mqtt.PublishAsync("navodnjavanje/pumpa/komanda", "false");

        return Ok(new { sesija.Id, sesija.Kraj });
    }
}
