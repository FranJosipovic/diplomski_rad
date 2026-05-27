/*
 * ESP32 — Senzorski čvor
 * Mjeri vlagu tla (kapacitivni senzor) i temperaturu (DHT22)
 * Objavljuje na MQTT svake 10 sekundi kao retained poruka
 *
 * Potrebne biblioteke (Arduino Library Manager):
 *   - PubSubClient by Nick O'Leary
 *   - SHTC3-SOLDERED (Soldered Electronics)
 *
 * Spajanje:
 *   SHTC3  SDA/SCL → I2C (GPIO 21/22)
 *   Vlaga  AOUT    → GPIO 10
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include "SHTC3-SOLDERED.h"

// ── Konfiguracija ─────────────────────────────────────────────────────────────
const char* SSID     = "Speedport-031111";
const char* PASSWORD = "x9ptbkxb5bxx2kxx";
const char* MQTT_HOST = "192.168.1.112";
const int   MQTT_PORT = 1883;

#define MOISTURE_PIN 10

// Kalibracija senzora vlage — izmjeri za konkretni senzor i tlo
const int ADC_SUHO  = 2800;   // vrijednost kad je senzor na suhom zraku 24h
const int ADC_MOKRO = 0;   // vrijednost kad je senzor u vodi 24h

const unsigned long PUBLISH_INTERVAL_MS = 10000; // 10 sekundi

// ── Objekti ───────────────────────────────────────────────────────────────────
SHTC3 shtcSensor;
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

// ── Pomoćne funkcije ──────────────────────────────────────────────────────────
float vlahaPostotak(int raw) {
    float postotak = map(raw, ADC_SUHO, ADC_MOKRO, 0, 100);
    return constrain(postotak, 0.0f, 100.0f);
}

void connectWifi() {
    Serial.printf("Spajanje na WiFi: %s", SSID);
    WiFi.begin(SSID, PASSWORD);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.printf("\nWiFi spojen, IP: %s\n", WiFi.localIP().toString().c_str());
}

void connectMqtt() {
    while (!mqtt.connected()) {
        Serial.print("Spajanje na MQTT...");
        if (mqtt.connect("esp32-senzori")) {
            Serial.println("spojeno");
        } else {
            Serial.printf("neuspjelo (rc=%d), pokušavam za 3s\n", mqtt.state());
            delay(3000);
        }
    }
}

// ── Setup / Loop ──────────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    shtcSensor.begin();
    connectWifi();
    mqtt.setServer(MQTT_HOST, MQTT_PORT);
    connectMqtt();
}

unsigned long lastPublish = 0;

void loop() {
    if (WiFi.status() != WL_CONNECTED) connectWifi();
    if (!mqtt.connected()) connectMqtt();
    mqtt.loop();

    if (millis() - lastPublish >= PUBLISH_INTERVAL_MS) {
        lastPublish = millis();

        shtcSensor.sample();
        float temp  = shtcSensor.readTempC();
        int   raw   = analogRead(MOISTURE_PIN);
        float vlaga = vlahaPostotak(raw);

        // Retained = true da ESP8266 u deep sleepu odmah dobije zadnju vrijednost
        mqtt.publish("navodnjavanje/senzori/vlaga",
                     String(vlaga, 1).c_str(), true);
        mqtt.publish("navodnjavanje/senzori/temperatura",
                     String(temp, 1).c_str(), true);
        Serial.printf("Vlaga: %.1f%%  Temp: %.1f°C\n", vlaga, temp);
    }
}
