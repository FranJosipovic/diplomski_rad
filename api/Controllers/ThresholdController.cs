using api.DTOs;
using api.Services;
using Microsoft.AspNetCore.Mvc;

namespace api.Controllers;

[ApiController]
[Route("api/threshold")]
public class ThresholdController(MqttService mqtt) : ControllerBase
{
    [HttpGet]
    public IActionResult Get() =>
        Ok(new { threshold = mqtt.CurrentThreshold });

    [HttpPut]
    public async Task<IActionResult> Put([FromBody] ThresholdRequest req)
    {
        mqtt.CurrentThreshold = (float)req.Threshold;
        await mqtt.PublishAsync(
            "navodnjavanje/config/threshold",
            req.Threshold.ToString("F2", System.Globalization.CultureInfo.InvariantCulture),
            retain: true);

        return Ok(new { threshold = req.Threshold });
    }
}
