/*
 * ESP8266 — Senzorski čvor
 * Mjeri vlagu tla (kapacitivni senzor) i temperaturu (SHTC3)
 * Objavljuje na MQTT svake 10 sekundi kao retained poruka
 *
 * Potrebne biblioteke (Arduino Library Manager):
 *   - PubSubClient by Nick O'Leary
 *   - SHTC3-SOLDERED (Soldered Electronics)
 *   - Adafruit NeoPixel
 *
 * Spajanje:
 *   SHTC3  SDA → D2 (GPIO4)
 *   SHTC3  SCL → D1 (GPIO5)
 *   Vlaga  AOUT → A0
 *
 * LED stanja:
 *   Connecting — plavo blja    (WiFi/MQTT spajanje)
 *   Ready      — stalno zeleno (spojen, nema aktivne sesije)
 *   Session    — zeleno blja   (sesija aktivna, mjeri i šalje)
 *   Error      — stalno crveno (WiFi ili MQTT fail → pokušaj reconnect)
 */

#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include "SHTC3-SOLDERED.h"
#include <Adafruit_NeoPixel.h>

// ── Konfiguracija ─────────────────────────────────────────────────────────────
const char* SSID      = "Speedport-031111";
const char* PASSWORD  = "x9ptbkxb5bxx2kxx";
const char* MQTT_HOST = "192.168.1.112";
const int   MQTT_PORT = 1883;

#define MOISTURE_PIN A0
#define LED_PIN      2
#define LED_COUNT    1

// Kalibracija — 10-bit ADC (0–1023), izmjeri za konkretni senzor i tlo
const int ADC_SUHO  = 1024;
const int ADC_MOKRO = 7;

const unsigned long PUBLISH_INTERVAL_MS = 10000;

// ── LED ───────────────────────────────────────────────────────────────────────
Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

enum LedState {
  LED_CONNECTING,  // blink blue  — WiFi/MQTT spajanje
  LED_READY,       // solid green — spojen, čeka sesiju
  LED_SESSION,     // blink green — sesija aktivna, mjeri i šalje
  LED_ERROR        // solid red   — WiFi ili MQTT fail
};

LedState      ledState  = LED_CONNECTING;
unsigned long ledTimer  = 0;
bool          ledToggle = false;

void setColor(uint8_t r, uint8_t g, uint8_t b) {
  strip.setPixelColor(0, strip.Color(r, g, b));
  strip.show();
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
    case LED_ERROR:
      setColor(200, 0, 0);
      break;
  }
}

// ── Stanje sesije ─────────────────────────────────────────────────────────────
bool sesijaAktivna = false;

// ── Objekti ───────────────────────────────────────────────────────────────────
SHTC3        shtcSensor;
WiFiClient   wifiClient;
PubSubClient mqtt(wifiClient);

// ── Pomoćne funkcije ──────────────────────────────────────────────────────────
float vlahaPostotak(int raw) {
  float postotak = map(raw, ADC_SUHO, ADC_MOKRO, 0, 100);
  return constrain(postotak, 0.0f, 100.0f);
}

// ── MQTT callback ─────────────────────────────────────────────────────────────
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];

  if (String(topic) == "navodnjavanje/sesija/status") {
    sesijaAktivna = (msg == "true");
    ledState = sesijaAktivna ? LED_SESSION : LED_READY;
    Serial.printf("SESIJA  %s\n", sesijaAktivna ? "aktivna" : "neaktivna");
  }
}

// ── Spajanje ──────────────────────────────────────────────────────────────────
void connectWifi() {
  Serial.printf("WIFI   spajanje na %s", SSID);
  ledState = LED_CONNECTING;
  WiFi.begin(SSID, PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    updateLed();
    delay(200);
    Serial.print(".");
  }
  Serial.printf("\nWIFI   spojen, IP: %s\n", WiFi.localIP().toString().c_str());
}

void connectMqtt() {
  ledState = LED_CONNECTING;
  while (!mqtt.connected()) {
    Serial.print("MQTT   spajanje...");
    bool ok = mqtt.connect(
      "esp8266-senzori",
      nullptr, nullptr,
      "navodnjavanje/uredaj/senzori", 1, true, "offline"
    );
    if (ok) {
      Serial.println("spojeno");
      mqtt.subscribe("navodnjavanje/sesija/status");
      mqtt.publish("navodnjavanje/uredaj/senzori", "ready", true);
    } else {
      Serial.printf("neuspjelo (rc=%d), pokušavam za 3s\n", mqtt.state());
      ledState = LED_ERROR;
      unsigned long t = millis();
      while (millis() - t < 3000) { updateLed(); delay(20); }
      ledState = LED_CONNECTING;
    }
  }
}

// ── Setup / Loop ──────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  strip.begin();
  strip.setBrightness(80);
  strip.show();

  shtcSensor.begin();
  connectWifi();

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  connectMqtt();

  // Čekaj retained sesija/status poruku
  unsigned long t = millis();
  while (millis() - t < 800) { mqtt.loop(); updateLed(); delay(10); }

  ledState = sesijaAktivna ? LED_SESSION : LED_READY;
}

unsigned long lastPublish = 0;

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    ledState = LED_CONNECTING;
    connectWifi();
    connectMqtt();
  } else if (!mqtt.connected()) {
    ledState = LED_CONNECTING;
    connectMqtt();
    // Obnovi stanje LED-a nakon reconnecta
    ledState = sesijaAktivna ? LED_SESSION : LED_READY;
  }

  mqtt.loop();
  updateLed();

  if (millis() - lastPublish >= PUBLISH_INTERVAL_MS) {
    lastPublish = millis();

    shtcSensor.sample();
    float temp  = shtcSensor.readTempC();
    int   raw   = analogRead(MOISTURE_PIN);
    float vlaga = vlahaPostotak(raw);

    Serial.printf("Vlaga: %.1f%% (raw=%d)  Temp: %.1f°C  Sesija: %s\n",
                  vlaga, raw, temp, sesijaAktivna ? "aktivna" : "neaktivna");

    if (!sesijaAktivna) return;

    mqtt.publish("navodnjavanje/senzori/vlaga",       String(vlaga, 1).c_str(), true);
    mqtt.publish("navodnjavanje/senzori/temperatura", String(temp,  1).c_str(), true);
  }
}
