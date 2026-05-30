using api.Services;
using Microsoft.AspNetCore.Mvc;

namespace api.Controllers;

[ApiController]
[Route("api/uredaji")]
public class UredajiController(MqttService mqtt) : ControllerBase
{
    // GET /api/uredaji/status
    [HttpGet("status")]
    public IActionResult GetStatus() => Ok(new
    {
        senzori = mqtt.SenzoriReady,
        pumpa = mqtt.PumpaReady,
    });
}
