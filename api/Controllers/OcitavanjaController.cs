using api.Services;
using Microsoft.AspNetCore.Mvc;

namespace api.Controllers;

[ApiController]
[Route("api/ocitavanja")]
public class OcitavanjaController(MqttService mqtt) : ControllerBase
{
    [HttpGet("latest")]
    public IActionResult Latest() =>
        Ok(new
        {
            vlaga = mqtt.LatestVlaga,
            temperatura = mqtt.LatestTemperatura,
            timestamp = mqtt.LatestTimestamp,
            pumpaStatus = mqtt.CurrentPumpaStatus,
            threshold = mqtt.CurrentThreshold
        });
}
