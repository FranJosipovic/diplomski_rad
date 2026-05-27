using api.Services;
using Microsoft.AspNetCore.Mvc;

namespace api.Controllers;

[ApiController]
[Route("api/pumpa")]
public class PumpaController(MqttService mqtt) : ControllerBase
{
    [HttpPost("on")]
    public async Task<IActionResult> On()
    {
        await mqtt.PublishAsync("navodnjavanje/pumpa/komanda", "true");
        return Ok();
    }

    [HttpPost("off")]
    public async Task<IActionResult> Off()
    {
        await mqtt.PublishAsync("navodnjavanje/pumpa/komanda", "false");
        return Ok();
    }
}
