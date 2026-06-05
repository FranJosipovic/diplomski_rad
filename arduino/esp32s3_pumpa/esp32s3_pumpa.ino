/*
 * ESP32-S3 (NULA DeepSleep) — Aktuatorski čvor
 * Mod 1 (pull)  — stalno spojen, reagira u realnom vremenu
 * Mod 2 (push)  — deep sleep timer, budi se, provjeri, odluči, zaspi
 *               — IO21 (RTC GPIO) + gpio_hold_en → relay DRŽI stanje kroz deep sleep
 * Mod 3 (timer) — deep sleep, budi se, pali pumpu fiksno, spava
 *
 * Potrebne biblioteke: PubSubClient, ArduinoJson, Adafruit NeoPixel
 * Board: ESP32S3 Dev Module (ili ekvivalentna NULA DeepSleep postavka)
 *
 * LED stanja:
 *   Connecting — plavo blja        (WiFi/MQTT spajanje)
 *   Ready      — stalno zeleno     (spojen, nema aktivne sesije)
 *   Session    — zeleno blja       (sesija aktivna, pumpa OFF)
 *   Pump ON    — zeleno↔plavo blja (pumpa radi)
 *   Error      — stalno crveno     (WiFi ili MQTT fail)
 *
 * Napomena: LED_PIN 48 je WS2812 na NULA DeepSleep pločici — provjeri shemu
 * ako LED ne radi.
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <esp_sleep.h>
#include <driver/gpio.h>
#include <Adafruit_NeoPixel.h>

const char* SSID      = "Speedport-031111";
const char* PASSWORD  = "x9ptbkxb5bxx2kxx";
const char* MQTT_HOST = "192.168.1.112";
const int   MQTT_PORT = 1883;

#define RELAY_PIN    21
#define RELAY_GPIO   GPIO_NUM_21
#define LED_PIN      2
#define LED_COUNT    1
#define BATTERY_PIN  10

// ─── LED ──────────────────────────────────────────────────────────────────────
Adafruit_NeoPixel led(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

enum LedState {
  LED_CONNECTING,  // blink blue  — WiFi/MQTT spajanje
  LED_READY,       // solid green — spojen, čeka sesiju
  LED_SESSION,     // blink green — sesija aktivna, pumpa OFF
  LED_PUMP_ON,     // green↔blue  — pumpa radi
  LED_ERROR        // solid red   — WiFi ili MQTT fail
};

LedState      ledState  = LED_CONNECTING;
unsigned long ledTimer  = 0;
bool          ledToggle = false;

void setColor(uint8_t r, uint8_t g, uint8_t b) {
  led.setPixelColor(0, led.Color(r, g, b));
  led.show();
}

void updateLed() {
  unsigned long now = millis();
  switch (ledState) {
    case LED_CONNECTING:
      if (now - ledTimer > 400) {
        ledTimer  = now;
        ledToggle = !ledToggle;
        setColor(0, 0, ledToggle ? 200 : 0);
      }
      break;
    case LED_READY:
      setColor(0, 200, 0);
      break;
    case LED_SESSION:
      if (now - ledTimer > 500) {
        ledTimer  = now;
        ledToggle = !ledToggle;
        setColor(0, ledToggle ? 200 : 0, 0);
      }
      break;
    case LED_PUMP_ON:
      if (now - ledTimer > 350) {
        ledTimer  = now;
        ledToggle = !ledToggle;
        setColor(0, ledToggle ? 200 : 0, ledToggle ? 0 : 200);  // green ↔ blue
      }
      break;
    case LED_ERROR:
      setColor(200, 0, 0);
      break;
  }
}

void ledShow(unsigned long ms) {
  unsigned long t = millis();
  while (millis() - t < ms) { updateLed(); delay(10); }
}

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
bool  fromDeepSleep       = false;

WiFiClient   wifiClient;
PubSubClient mqtt(wifiClient);

// ─── Baterija ─────────────────────────────────────────────────────────────────
void publishBattery() {
  int   raw  = analogRead(BATTERY_PIN);
  float vout = (raw / 4095.0f) * 3.3f;
  float vin  = vout * 2.0f;
  int   pct  = constrain((int)((vin - 3.0f) / 1.2f * 100.0f), 0, 100);
  char payload[40];
  snprintf(payload, sizeof(payload), "{\"vin\":%.2f,\"postotak\":%d}", vin, pct);
  mqtt.publish("navodnjavanje/pumpa/baterija", payload);
  logf("BATERIJA  Vin=%.2fV | %d%%", vin, pct);
}

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
  mqtt.publish("navodnjavanje/pumpa/status", on ? "true" : "false", true);
  if (on)
    ledState = LED_PUMP_ON;
  else
    ledState = sesijaAktivna ? LED_SESSION : LED_READY;
  logf("RELAY  %s", on ? "ON" : "OFF");
}

void refreshLedFromState() {
  if (pumpOn)
    ledState = LED_PUMP_ON;
  else if (sesijaAktivna)
    ledState = LED_SESSION;
  else
    ledState = LED_READY;
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
    JsonDocument doc;
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
    refreshLedFromState();

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
bool connectWifi() {
  logf("WIFI   spajanje na \"%s\"...", SSID);
  WiFi.begin(SSID, PASSWORD);
  int i = 0;
  while (WiFi.status() != WL_CONNECTED && i++ < 40) {
    updateLed();
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    logf("WIFI   spojen | IP %s | RSSI %d dBm", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    return true;
  }
  log("WIFI   TIMEOUT — nije uspio");
  return false;
}

// ─── MQTT connect ─────────────────────────────────────────────────────────────
bool connectMqtt() {
  logf("MQTT   spajanje na %s:%d...", MQTT_HOST, MQTT_PORT);
  int i = 0;
  while (!mqtt.connected() && i++ < 8) {
    bool ok = mqtt.connect(
      "esp32s3-pumpa",
      nullptr, nullptr,
      "navodnjavanje/uredaj/pumpa", 1, true, "offline"
    );
    if (ok) {
      logf("MQTT   spojen (pokušaj %d)", i);
      // Obavijesti "ready" samo pri svježem bootu — ne pri buđenju iz deep sleepa
      // (u modu 2/3 sesija je već aktivna, ready nije potreban)
      if (!fromDeepSleep)
        mqtt.publish("navodnjavanje/uredaj/pumpa", "ready", true);
    } else {
      logf("MQTT   neuspjelo rc=%d, pokušaj %d/8", mqtt.state(), i);
    }
    updateLed();
    delay(500);
  }
  return mqtt.connected();
}

void mqttLoopMs(unsigned long ms) {
  unsigned long t = millis();
  while (millis() - t < ms) { mqtt.loop(); updateLed(); delay(10); }
}

// ─── Deep sleep ───────────────────────────────────────────────────────────────
void goDeepSleep(unsigned long minutes) {
  mqttLoopMs(300);
  mqtt.disconnect();
  WiFi.disconnect();
  delay(100);

  ledShow(600);   // kratko pokaži stanje pumpe prije spavanja
  setColor(0, 0, 0);
  led.show();

  gpio_hold_en(RELAY_GPIO);
  esp_sleep_enable_timer_wakeup((uint64_t)minutes * 60ULL * 1000000ULL);
  logf("SLEEP  deep sleep %lu min (pumpa ostaje %s)", minutes, pumpOn ? "ON" : "OFF");
  Serial.flush();
  esp_deep_sleep_start();
}

// ─── Setup ────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  delay(500);
  Serial.println();

  led.begin();
  led.setBrightness(80);
  led.show();

  log("============================");
  log("BOOT   ESP32-S3 pumpa");

  esp_sleep_wakeup_cause_t wakeReason = esp_sleep_get_wakeup_cause();
  fromDeepSleep = (wakeReason == ESP_SLEEP_WAKEUP_TIMER);
  logf("BOOT   razlog: %s", fromDeepSleep ? "deep sleep timer wake" : "power on / reset");
  log("============================");

  if (fromDeepSleep) {
    gpio_hold_dis(RELAY_GPIO);
    pinMode(RELAY_PIN, OUTPUT);
    pumpOn = (digitalRead(RELAY_PIN) == HIGH);
    logf("RELAY  obnova iz deep sleepa: %s", pumpOn ? "ON" : "OFF");
  } else {
    pinMode(RELAY_PIN, OUTPUT);
    digitalWrite(RELAY_PIN, LOW);
    pumpOn = false;
    log("RELAY  inicijalizacija → OFF");
  }

  ledState = LED_CONNECTING;

  if (!connectWifi()) {
    ledState = LED_ERROR;
    ledShow(2000);
    log("WIFI   FAIL — deep sleep 1 min pa restart");
    setColor(0, 0, 0);
    gpio_hold_en(RELAY_GPIO);
    esp_sleep_enable_timer_wakeup(60ULL * 1000000ULL);
    Serial.flush();
    esp_deep_sleep_start();
    return;
  }

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);

  if (!connectMqtt()) {
    ledState = LED_ERROR;
    ledShow(2000);
    log("MQTT   FAIL — deep sleep 1 min pa restart");
    setColor(0, 0, 0);
    gpio_hold_en(RELAY_GPIO);
    esp_sleep_enable_timer_wakeup(60ULL * 1000000ULL);
    Serial.flush();
    esp_deep_sleep_start();
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

  // Označi buđenje iz deep sleepa (Mod 2/3) — API to bilježi i graf prikazuje kao oznaku
  if (fromDeepSleep) {
    mqtt.publish("navodnjavanje/pumpa/wake", "1");
    log("WAKE   objavljeno buđenje iz deep sleepa");
  }

  log("MQTT   čekam retained poruke (1.2s)...");
  mqttLoopMs(1200);

  logf("SETUP  mod=%d | threshold=%.1f%% | sesija=%s | vlaga=%.1f%%",
       currentMod, currentThreshold,
       sesijaAktivna ? "aktivna" : "neaktivna",
       currentVlaga);

  refreshLedFromState();

  // ── Mod 2 ─────────────────────────────────────────────────────────────────
  if (currentMod == 2) {
    if (!sesijaAktivna) {
      setPump(false);
      log("MOD 2  sesija neaktivna — ostaje budan, čeka sesiju u loop()");
      // ne ide u sleep — nastavlja u loop()
      return;
    }

    if (!receivedVlaga) {
      log("MOD 2  čekam vlagu (max 15s)...");
      unsigned long t = millis();
      while (!receivedVlaga && millis() - t < 15000) { mqtt.loop(); updateLed(); delay(10); }
    }

    if (!receivedVlaga) {
      log("MOD 2  vlaga nije stigla — zadržavam trenutno stanje pumpe");
    } else if (currentVlaga < currentThreshold) {
      logf("MOD 2  vlaga %.1f%% < threshold %.1f%% — pumpa ON", currentVlaga, currentThreshold);
      setPump(true);
    } else {
      logf("MOD 2  vlaga %.1f%% >= threshold %.1f%% — pumpa OFF", currentVlaga, currentThreshold);
      setPump(false);
    }

    publishBattery();
    goDeepSleep(intervalMinuta);
    return;
  }

  // ── Mod 3 ─────────────────────────────────────────────────────────────────
  if (currentMod == 3) {
    if (!sesijaAktivna) {
      log("MOD 3  sesija neaktivna — ostaje budan, čeka sesiju u loop()");
      // ne ide u sleep — nastavlja u loop()
      return;
    }

    logf("MOD 3  pumpa ON %ds", trajanjeSek);
    setPump(true);
    unsigned long t = millis();
    while (millis() - t < (unsigned long)trajanjeSek * 1000UL) { updateLed(); delay(10); }
    setPump(false);
    publishBattery();
    goDeepSleep(intervalPaljenjaMin);
    return;
  }

  // ── Mod 1: ostaje u loop() ────────────────────────────────────────────────
  log("MOD 1  stalno aktivan — ulazim u loop");
}

// ─── Loop (samo Mod 1) ────────────────────────────────────────────────────────
unsigned long lastBatteryMs = 0;
const unsigned long BATTERY_INTERVAL = 5UL * 60UL * 1000UL;  // 5 min

void loop() {
  updateLed();

  if (WiFi.status() != WL_CONNECTED) {
    ledState = LED_CONNECTING;
    log("WIFI   veza izgubljena — pokušavam reconnect...");
    connectWifi();
    return;
  }

  if (!mqtt.connected()) {
    ledState = LED_CONNECTING;
    logf("MQTT   veza izgubljena (rc=%d) — reconnect...", mqtt.state());
    if (connectMqtt()) {
      log("MQTT   resubscribe nakon reconnecta");
      mqtt.subscribe("navodnjavanje/senzori/vlaga");
      mqtt.subscribe("navodnjavanje/pumpa/komanda");
      mqtt.subscribe("navodnjavanje/sesija/status");
      mqtt.subscribe("navodnjavanje/config/threshold");
      refreshLedFromState();
    }
    return;
  }

  mqtt.loop();

  // ── Mod 2: čekaj sesiju → odradi ciklus → zaspi ──────────────────────────
  if (currentMod == 2) {
    if (sesijaAktivna) {
      if (!receivedVlaga) {
        log("MOD 2  sesija aktivna, čekam vlagu (max 15s)...");
        unsigned long t = millis();
        while (!receivedVlaga && millis() - t < 15000) { mqtt.loop(); updateLed(); delay(10); }
      }
      receivedVlaga = false;
      if (currentVlaga < 0) {
        log("MOD 2  vlaga nepoznata — pumpa OFF");
        setPump(false);
      } else if (currentVlaga < currentThreshold) {
        logf("MOD 2  vlaga %.1f%% < threshold %.1f%% — pumpa ON", currentVlaga, currentThreshold);
        setPump(true);
      } else {
        logf("MOD 2  vlaga %.1f%% >= threshold %.1f%% — pumpa OFF", currentVlaga, currentThreshold);
        setPump(false);
      }
      publishBattery();
      goDeepSleep(intervalMinuta);
    }
    delay(20);
    return;
  }

  // ── Mod 3: čekaj sesiju → pali pumpu fiksno → zaspi ─────────────────────
  if (currentMod == 3) {
    if (sesijaAktivna) {
      logf("MOD 3  sesija aktivna — pumpa ON %ds", trajanjeSek);
      setPump(true);
      unsigned long t = millis();
      while (millis() - t < (unsigned long)trajanjeSek * 1000UL) { updateLed(); delay(10); }
      setPump(false);
      publishBattery();
      goDeepSleep(intervalPaljenjaMin);
    }
    delay(20);
    return;
  }

  // ── Mod 1 ─────────────────────────────────────────────────────────────────
  if (receivedVlaga) {
    receivedVlaga = false;
    bool treba = sesijaAktivna && (currentVlaga < currentThreshold);
    if (treba != pumpOn) {
      logf("MOD 1  vlaga %.1f%% %s threshold %.1f%% → pumpa %s",
           currentVlaga, treba ? "<" : ">=", currentThreshold, treba ? "ON" : "OFF");
      setPump(treba);
    }
  }

  if (millis() - lastBatteryMs >= BATTERY_INTERVAL) {
    lastBatteryMs = millis();
    publishBattery();
  }

  delay(20);
}
