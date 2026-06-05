using api.Services;
using Microsoft.AspNetCore.Mvc;

namespace api.Controllers;

[ApiController]
[Route("api/senzori")]
public class SenzoriController(MqttService mqtt) : ControllerBase
{
    // POST /api/senzori/citaj
    // Diagnostički live read — pošalje komandu senzoru, čeka svježe očitavanje.
    // NE sprema u bazu (snimanje se događa samo dok je sesija aktivna).
    [HttpPost("citaj")]
    public async Task<IActionResult> Citaj()
    {
        if (!mqtt.SenzoriReady)
            return Ok(new { online = false });

        // Zapamti zadnji timestamp da prepoznamo svježe očitavanje
        var prije = mqtt.LatestTimestamp;

        await mqtt.PublishAsync("navodnjavanje/senzori/komanda", "read");

        // Čekaj do ~4s da stigne nova vrijednost
        var deadline = DateTime.UtcNow.AddSeconds(4);
        while (DateTime.UtcNow < deadline)
        {
            if (mqtt.LatestTimestamp != prije && mqtt.LatestTimestamp is not null)
                break;
            await Task.Delay(150);
        }

        var fresh = mqtt.LatestTimestamp != prije && mqtt.LatestTimestamp is not null;

        return Ok(new
        {
            online = true,
            fresh,
            vlaga = mqtt.LatestVlaga,
            temperatura = mqtt.LatestTemperatura,
            timestamp = mqtt.LatestTimestamp
        });
    }
}
