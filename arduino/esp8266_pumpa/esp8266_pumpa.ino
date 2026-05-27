/*
 * ESP8266 (Dasduino Connect) — Aktuatorski čvor
 * Mod 1 (pull)  — stalno spojen, reagira u realnom vremenu
 * Mod 2 (push)  — deep sleep, budi se, provjerava vlagu, odlučuje, spava
 * Mod 3 (timer) — deep sleep, budi se, pali pumpu fiksno, spava
 *
 * Potrebne biblioteke: PubSubClient, ArduinoJson
 * Deep sleep (Mod 2/3): kratka žica IO16 ↔ RST
 */

#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

const char* SSID      = "Speedport-031111";
const char* PASSWORD  = "x9ptbkxb5bxx2kxx";
const char* MQTT_HOST = "192.168.1.112";
const int   MQTT_PORT = 1883;

#define RELAY_PIN 14

// ─── Stanje primljeno iz MQTT retained poruka ─────────────────────────────────
float currentThreshold    = 50.0f;
int   currentMod          = 1;
int   intervalMinuta      = 5;
int   intervalPaljenjaMin = 60;
int   trajanjeSek         = 30;
bool  sesijaAktivna       = false;
float currentVlaga        = -1.0f;
bool  pumpOn              = false;
bool  receivedVlaga       = false;

WiFiClient   wifiClient;
PubSubClient mqtt(wifiClient);

// ─── Logging ──────────────────────────────────────────────────────────────────
void log(const char* msg) {
  Serial.printf("[%8lu] %s\n", millis(), msg);
}

void logf(const char* fmt, ...) {
  char buf[128];
  va_list args;
  va_start(args, fmt);
  vsnprintf(buf, sizeof(buf), fmt, args);
  va_end(args);
  log(buf);
}

// ─── Relay ────────────────────────────────────────────────────────────────────
void setPump(bool on) {
  pumpOn = on;
  digitalWrite(RELAY_PIN, on ? HIGH : LOW);
  mqtt.publish("navodnjavanje/pumpa/status", on ? "true" : "false", false);
  logf("RELAY  %s", on ? "ON" : "OFF");
}

// ─── MQTT callback ────────────────────────────────────────────────────────────
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  String t = String(topic);

  logf("MQTT ← [%s] = %s", topic, msg.c_str());

  if (t == "navodnjavanje/config/threshold") {
    currentThreshold = msg.toFloat();
    logf("CONFIG threshold = %.1f%%", currentThreshold);

  } else if (t == "navodnjavanje/config/mod") {
    currentMod = msg.toInt();
    logf("CONFIG mod = %d", currentMod);

  } else if (t == "navodnjavanje/config/interval") {
    intervalMinuta = msg.toInt();
    logf("CONFIG interval = %d min", intervalMinuta);

  } else if (t == "navodnjavanje/config/timer") {
    StaticJsonDocument<128> doc;
    if (!deserializeJson(doc, msg)) {
      intervalPaljenjaMin = doc["paljenjeMin"] | 60;
      trajanjeSek         = doc["trajanjeSek"] | 30;
      logf("CONFIG timer: paljenje=%dmin trajanje=%ds", intervalPaljenjaMin, trajanjeSek);
    }

  } else if (t == "navodnjavanje/sesija/status") {
    bool bio = sesijaAktivna;
    sesijaAktivna = (msg == "true");
    logf("SESIJA %s → %s", bio ? "aktivna" : "neaktivna", sesijaAktivna ? "aktivna" : "neaktivna");
    if (!sesijaAktivna && bio) { log("SESIJA završena — gašenje pumpe"); setPump(false); }

  } else if (t == "navodnjavanje/pumpa/komanda") {
    logf("KOMANDA pumpa %s (server override)", msg == "true" ? "ON" : "OFF");
    setPump(msg == "true");

  } else if (t == "navodnjavanje/senzori/vlaga") {
    float v = msg.toFloat();
    logf("VLAGA  %.1f%% (threshold %.1f%%) → %s",
         v, currentThreshold, v < currentThreshold ? "ISPOD" : "ok");
    currentVlaga  = v;
    receivedVlaga = true;
  }
}

// ─── WiFi ─────────────────────────────────────────────────────────────────────
void connectWifi() {
  logf("WIFI   spajanje na \"%s\"...", SSID);
  WiFi.begin(SSID, PASSWORD);
  int i = 0;
  while (WiFi.status() != WL_CONNECTED && i++ < 40) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED)
    logf("WIFI   spojen | IP %s | RSSI %d dBm", WiFi.localIP().toString().c_str(), WiFi.RSSI());
  else
    log("WIFI   TIMEOUT — nije uspio");
}

// ─── MQTT connect ─────────────────────────────────────────────────────────────
void connectMqtt() {
  logf("MQTT   spajanje na %s:%d...", MQTT_HOST, MQTT_PORT);
  int i = 0;
  while (!mqtt.connected() && i++ < 8) {
    if (mqtt.connect("esp8266-pumpa"))
      logf("MQTT   spojen (pokušaj %d)", i);
    else
      logf("MQTT   neuspjelo rc=%d, pokušaj %d/8", mqtt.state(), i);
    delay(500);
  }
}

void mqttLoopMs(unsigned long ms) {
  unsigned long t = millis();
  while (millis() - t < ms) { mqtt.loop(); delay(10); }
}

// ─── Setup ───────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println();
  log("============================");
  log("BOOT   ESP8266 pumpa");
  logf("BOOT   razlog: %s", ESP.getResetReason().c_str());
  log("============================");

  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  connectWifi();
  if (WiFi.status() != WL_CONNECTED) {
    log("WIFI   FAIL — deep sleep 1 min pa restart");
    ESP.deepSleep(60UL * 1000000UL);
    return;
  }

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  connectMqtt();
  if (!mqtt.connected()) {
    log("MQTT   FAIL — deep sleep 1 min pa restart");
    ESP.deepSleep(60UL * 1000000UL);
    return;
  }

  log("MQTT   pretplata na topice...");
  mqtt.subscribe("navodnjavanje/config/threshold");
  mqtt.subscribe("navodnjavanje/config/mod");
  mqtt.subscribe("navodnjavanje/config/interval");
  mqtt.subscribe("navodnjavanje/config/timer");
  mqtt.subscribe("navodnjavanje/sesija/status");
  mqtt.subscribe("navodnjavanje/pumpa/komanda");
  mqtt.subscribe("navodnjavanje/senzori/vlaga");

  log("MQTT   čekam retained poruke (1.2s)...");
  mqttLoopMs(1200);

  logf("SETUP  mod=%d | threshold=%.1f%% | sesija=%s | vlaga=%.1f%%",
       currentMod, currentThreshold,
       sesijaAktivna ? "aktivna" : "neaktivna",
       currentVlaga);

  // ── Mod 2 ─────────────────────────────────────────────────────────────────
  if (currentMod == 2) {
    log("MOD 2  čekam vlagu (max 2s)...");
    unsigned long t = millis();
    while (!receivedVlaga && millis() - t < 2000) { mqtt.loop(); delay(10); }

    if (!receivedVlaga)    log("MOD 2  vlaga nije stigla — pumpa OFF");
    else if (!sesijaAktivna) log("MOD 2  sesija neaktivna — pumpa OFF");
    else if (currentVlaga >= currentThreshold)
      logf("MOD 2  vlaga %.1f%% >= threshold %.1f%% — pumpa OFF", currentVlaga, currentThreshold);
    else {
      logf("MOD 2  vlaga %.1f%% < threshold %.1f%% — pumpa ON %ds", currentVlaga, currentThreshold, trajanjeSek);
      setPump(true);
      delay((unsigned long)trajanjeSek * 1000UL);
      setPump(false);
    }

    mqtt.disconnect();
    WiFi.disconnect();
    logf("MOD 2  deep sleep %d min", intervalMinuta);
    ESP.deepSleep((unsigned long)intervalMinuta * 60UL * 1000000UL);
    return;
  }

  // ── Mod 3 ─────────────────────────────────────────────────────────────────
  if (currentMod == 3) {
    if (!sesijaAktivna) {
      log("MOD 3  sesija neaktivna — preskačem paljenje");
    } else {
      logf("MOD 3  pumpa ON %ds", trajanjeSek);
      setPump(true);
      delay((unsigned long)trajanjeSek * 1000UL);
      setPump(false);
    }

    mqtt.disconnect();
    WiFi.disconnect();
    logf("MOD 3  deep sleep %d min", intervalPaljenjaMin);
    ESP.deepSleep((unsigned long)intervalPaljenjaMin * 60UL * 1000000UL);
    return;
  }

  // ── Mod 1: ostaje u loop() ────────────────────────────────────────────────
  log("MOD 1  stalno aktivan — ulazim u loop");
}

// ─── Loop (samo Mod 1) ────────────────────────────────────────────────────────
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    log("WIFI   veza izgubljena — pokušavam reconnect...");
    connectWifi();
    return;
  }

  if (!mqtt.connected()) {
    logf("MQTT   veza izgubljena (rc=%d) — reconnect...", mqtt.state());
    connectMqtt();
    if (mqtt.connected()) {
      log("MQTT   resubscribe nakon reconnecta");
      mqtt.subscribe("navodnjavanje/senzori/vlaga");
      mqtt.subscribe("navodnjavanje/pumpa/komanda");
      mqtt.subscribe("navodnjavanje/sesija/status");
      mqtt.subscribe("navodnjavanje/config/threshold");
    }
    return;
  }

  mqtt.loop();

  if (receivedVlaga) {
    receivedVlaga = false;
    bool treba = sesijaAktivna && (currentVlaga < currentThreshold);
    if (treba != pumpOn) {
      logf("MOD 1  vlaga %.1f%% %s threshold %.1f%% → pumpa %s",
           currentVlaga, treba ? "<" : ">=", currentThreshold, treba ? "ON" : "OFF");
      setPump(treba);
    }
  }

  delay(20);
}
