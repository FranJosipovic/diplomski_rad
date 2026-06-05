// Kalibracija OTPORNOG senzora vlage tla (FC-28 / YL-69, VCC/D0/A0/GND) — ESP8266
// Cita A0 svakih 5 s, racuna prosjek od pocetka mjerenja.
// Na pritisak USER buttona ispise prosjek i prestane mjeriti.
//
// Spajanje:
//   VCC -> 3V3
//   GND -> GND
//   A0  -> A0 (analogni ulaz ESP8266)
//   D0  -> D5 (GPIO14) — opcionalno, digitalni prag s pločice (potenciometar)
//
// NAPOMENA o otpornom senzoru:
//   - Tipicno: SUHO = visok ADC, MOKRO = nizak ADC (provjeri svojim mjerenjem).
//   - Korodira tijekom vremena (galvanski kontakt) — za dulja mjerenja manje
//     pouzdan od kapacitivnog. Za kalibraciju i kratke testove je u redu.
//   - A0 na ESP8266 podnosi 0–1,0 V (goli cip) / 0–3,3 V (NodeMCU/Wemos s djeliteljem).

#define MOISTURE_PIN A0      // analogni izlaz senzora
#define D0_PIN       14      // D5 = GPIO14, digitalni izlaz senzora (opcionalno)
#define BUTTON_PIN    0      // FLASH/USER button (GPIO0 / D3)
#define INTERVAL_MS 5000     // mjerenje svakih 5 s

unsigned long brojOcitavanja = 0;
double zbroj = 0;            // double da ne dodje do overflowa kod dugog mjerenja
unsigned long zadnjeMjerenje = 0;
bool mjerenjeAktivno = true;

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(BUTTON_PIN, INPUT_PULLUP);   // tipka spaja na GND kad je pritisnuta
  pinMode(D0_PIN, INPUT);              // digitalni izlaz senzora

  Serial.println();
  Serial.println("=== Kalibracija otpornog senzora vlage (ESP8266) ===");
  Serial.println("Mjerenje svakih 5 s. Stisni USER button za prosjek i kraj.");
  Serial.println();
}

void loop() {
  if (!mjerenjeAktivno) {
    return;  // mjerenje gotovo, nista vise
  }

  // --- Provjera tipke (s jednostavnim debounce) ---
  if (digitalRead(BUTTON_PIN) == LOW) {
    delay(30);
    if (digitalRead(BUTTON_PIN) == LOW) {
      ispisiProsjekIStani();
      while (digitalRead(BUTTON_PIN) == LOW) {
        delay(10);  // cekaj da se tipka pusti
      }
      return;
    }
  }

  // --- Mjerenje svakih INTERVAL_MS ---
  unsigned long sada = millis();
  if (sada - zadnjeMjerenje >= INTERVAL_MS) {
    zadnjeMjerenje = sada;

    int raw  = analogRead(MOISTURE_PIN);
    int dig  = digitalRead(D0_PIN);     // 0/1, ovisi o pragu na potenciometru
    zbroj   += raw;
    brojOcitavanja++;

    Serial.printf("Ocitavanje %lu: A0 = %d  D0 = %d  (trenutni prosjek = %.1f)\n",
                  brojOcitavanja, raw, dig, zbroj / brojOcitavanja);
  }
}

void ispisiProsjekIStani() {
  Serial.println();
  Serial.println("=== KRAJ MJERENJA ===");
  if (brojOcitavanja == 0) {
    Serial.println("Nema ocitavanja.");
  } else {
    double prosjek = zbroj / brojOcitavanja;
    Serial.printf("Broj ocitavanja: %lu\n", brojOcitavanja);
    Serial.printf("PROSJEK A0 = %.2f\n", prosjek);
    Serial.println("-> upisi ovu vrijednost u ADC_SUHO ili ADC_MOKRO.");
  }
  Serial.println();
  mjerenjeAktivno = false;
}
