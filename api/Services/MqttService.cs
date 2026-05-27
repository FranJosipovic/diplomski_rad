using api.Data;
using api.Models;
using Microsoft.EntityFrameworkCore;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Protocol;

namespace api.Services;

public class MqttService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _config;
    private readonly ILogger<MqttService> _logger;
    private IMqttClient _client = null!;

    // In-memory latest values (za dashboard polling)
    public float? LatestVlaga { get; private set; }
    public float? LatestTemperatura { get; private set; }
    public DateTimeOffset? LatestTimestamp { get; private set; }
    public bool CurrentPumpaStatus { get; private set; }
    public float CurrentThreshold { get; set; } = 50f;

    // Buffer za pariranje vlaga+temperatura u jedan Ocitavanje zapis
    private float? _pendingVlaga;
    private float? _pendingTemp;

    public MqttService(IServiceScopeFactory scopeFactory, IConfiguration config, ILogger<MqttService> logger)
    {
        _scopeFactory = scopeFactory;
        _config = config;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var factory = new MqttFactory();
        _client = factory.CreateMqttClient();

        _client.ApplicationMessageReceivedAsync += OnMessageReceived;
        _client.DisconnectedAsync += OnDisconnected;

        await ConnectAsync();

        await Task.Delay(Timeout.Infinite, stoppingToken);
    }

    private async Task ConnectAsync()
    {
        var host = _config["Mqtt:Host"] ?? "localhost";
        var port = int.Parse(_config["Mqtt:Port"] ?? "1883");

        var options = new MqttClientOptionsBuilder()
            .WithTcpServer(host, port)
            .WithClientId("dotnet-api")
            .Build();

        try
        {
            await _client.ConnectAsync(options);

            await _client.SubscribeAsync("navodnjavanje/senzori/#");
            await _client.SubscribeAsync("navodnjavanje/pumpa/status");
            await _client.SubscribeAsync("navodnjavanje/config/threshold");

            _logger.LogInformation("MQTT connected to {host}:{port}", host, port);
        }
        catch (Exception ex)
        {
            _logger.LogWarning("MQTT connect failed: {msg}", ex.Message);
        }
    }

    private async Task OnDisconnected(MqttClientDisconnectedEventArgs e)
    {
        _logger.LogWarning("MQTT disconnected — reconnect in 5s");
        await Task.Delay(5000);
        try { await ConnectAsync(); } catch { }
    }

    private async Task OnMessageReceived(MqttApplicationMessageReceivedEventArgs e)
    {
        var topic = e.ApplicationMessage.Topic;
        var payload = e.ApplicationMessage.ConvertPayloadToString();

        switch (topic)
        {
            case "navodnjavanje/config/threshold":
                if (float.TryParse(payload, System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture, out var t))
                    CurrentThreshold = t;
                break;

            case "navodnjavanje/pumpa/status":
                CurrentPumpaStatus = payload == "true";
                await SaveEventPumpeAsync(CurrentPumpaStatus);
                break;

            case "navodnjavanje/senzori/vlaga":
                if (float.TryParse(payload, System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture, out var v))
                {
                    LatestVlaga = v;
                    _pendingVlaga = v;
                    await TrySaveOcitavanjeAsync();
                }
                break;

            case "navodnjavanje/senzori/temperatura":
                if (float.TryParse(payload, System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture, out var temp))
                {
                    LatestTemperatura = temp;
                    LatestTimestamp = DateTimeOffset.UtcNow;
                    _pendingTemp = temp;
                    await TrySaveOcitavanjeAsync();
                }
                break;
        }
    }

    // Sprema zapis samo kad su obje vrijednosti dostupne iz istog ciklusa
    private async Task TrySaveOcitavanjeAsync()
    {
        if (_pendingVlaga is null || _pendingTemp is null) return;

        var vlaga = _pendingVlaga.Value;
        var temp  = _pendingTemp.Value;
        _pendingVlaga = null;
        _pendingTemp  = null;

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var aktivna = await db.Sesije.FirstOrDefaultAsync(s => s.Kraj == null);
        if (aktivna is null) return;

        db.Ocitavanja.Add(new Ocitavanje
        {
            SesijaId   = aktivna.Id,
            Vlaga      = (decimal)vlaga,
            Temperatura = (decimal)temp,
            Timestamp  = DateTimeOffset.UtcNow
        });

        await db.SaveChangesAsync();
    }

    private async Task SaveEventPumpeAsync(bool status)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var aktivna = await db.Sesije.FirstOrDefaultAsync(s => s.Kraj == null);
        if (aktivna is null) return;

        // Deduplikacija — ne spremi isti status dva puta zaredom
        var last = await db.EventiPumpe
            .Where(ep => ep.SesijaId == aktivna.Id)
            .OrderByDescending(ep => ep.Timestamp)
            .FirstOrDefaultAsync();

        if (last?.Status == status) return;

        db.EventiPumpe.Add(new EventPumpe
        {
            SesijaId  = aktivna.Id,
            Status    = status,
            Timestamp = DateTimeOffset.UtcNow
        });

        await db.SaveChangesAsync();
    }

    public async Task PublishAsync(string topic, string payload, bool retain = false)
    {
        if (!_client.IsConnected)
        {
            _logger.LogWarning("MQTT nije spojen — publish preskočen: {topic}", topic);
            return;
        }

        var message = new MqttApplicationMessageBuilder()
            .WithTopic(topic)
            .WithPayload(payload)
            .WithRetainFlag(retain)
            .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
            .Build();

        await _client.PublishAsync(message);
    }
}
