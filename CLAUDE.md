# Pametno navodnjavanje — Diplomski rad
## CLAUDE.md — Kontekst za razvoj

---

## Pregled projekta

Sustav pametnog navodnjavanja koji koristi IoT uređaje za mjerenje vlage tla i temperature zraka te automatski kontrolira pumpu za vodu. Cilj je usporediti tri načina rada u pogledu preciznosti navodnjavanja i potrošnje energije.

---

## Arhitektura sustava

```
ESP32 (senzori) ──MQTT publish──→ Mosquitto Broker ←──MQTT subscribe── .NET API
                                          ↑
                                  MQTT publish ←── .NET API
                                          ↓
                                  MQTT subscribe ── ESP32-S3 (pumpa/relej)

Frontend ──REST polling (60s)──→ .NET Minimal API ──→ PostgreSQL
Frontend ──manual refresh──────→ .NET Minimal API
```

### Komponente

| Komponenta | Tehnologija | Uloga |
|---|---|---|
| Senzorski uređaj | ESP32 | Mjeri vlagu tla i temperaturu, šalje na MQTT |
| Aktuatorski uređaj | ESP32-S3 (Soldered Nula) | Prima komande s MQTT, pali/gasi pumpu preko releja |
| Broker | Mosquitto | MQTT posrednik između uređaja i API-ja |
| Backend | .NET Minimal API | REST API, MQTT klijent u backgroundu, zapis u bazu |
| Baza | PostgreSQL | Persistencija sesija, očitavanja, eventi pumpe |
| Frontend | (odabir: React/Vue) | Dashboard, kontrola sesija, usporedba modova |

---

## Načini rada (scenariji)

### Mod 1 — Pull (stalno aktivan)
- ESP32-S3 je **stalno spojen** na MQTT broker
- Broker **push-a** promjene thresholda odmah na uređaj
- ESP32-S3 kontinuirano sluša i reagira u realnom vremenu
- **Prednost:** precizna reakcija, minimalno kašnjenje
- **Nedostatak:** visoka potrošnja baterije

### Mod 2 — Push (deep sleep)
- ESP32-S3 spava N minuta → budi se → spoji na WiFi i MQTT
- Subscribea na threshold topic → broker **odmah šalje retained poruku**
- ESP32-S3 odlučuje o pumpi → publishuje očitavanja → vraća se u sleep
- **Prednost:** niska potrošnja baterije
- **Nedostatak:** kašnjenje reakcije do N minuta

### Mod 3 — Timer (slijepi)
- ESP32-S3 spava X minuta → budi se → pali pumpu Y sekundi → spava
- **Ne gleda senzore** — fiksni raspored bez povratne informacije
- Služi kao **baseline** za usporedbu
- **Prednost:** najjednostavnija implementacija
- **Nedostatak:** može prekomjerno ili nedovoljno zalijevati

### Prijedlog poboljšanja (nije implementirati — samo opisati u radu)
- **Hibridni mod:** ESP32-S3 spava N minuta, ali ako je vlaga blizu thresholda (npr. 10% iznad), skrati interval na 1 minutu
- Adaptivni sleep interval koji balansira potrošnju i preciznost

---

## MQTT topic struktura

```
navodnjavanje/
├── senzori/
│   ├── vlaga          → ESP32 publishuje (float, %)
│   ├── temperatura    → ESP32 publishuje (float, °C)
│   └── komanda        → API publishuje "read" (diagnostički live read na zahtjev — ne sprema se u bazu)
├── pumpa/
│   ├── status         → ESP32-S3 publishuje (bool: true=ON, false=OFF)
│   ├── komanda        → API publishuje komandu za pumpu (bool)
│   └── wake           → ESP32-S3 publishuje pri svakom buđenju iz deep sleepa (Mod 2/3)
├── config/
│   ├── threshold      → API publishuje RETAINED (float, %)
│   ├── mod            → API publishuje RETAINED (int: 1/2/3)
│   ├── interval       → API publishuje RETAINED (int, minute — za mod 2)
│   └── timer          → API publishuje RETAINED (JSON: {paljenjeMin, trajanjeMin} — za mod 3)
└── sesija/
    └── status         → API publishuje (bool: true=aktivna, false=završena)
```

**Napomena:** `config/*` topici moraju biti **retained=true** jer ESP32-S3 u deep sleepu treba odmah primiti zadnju vrijednost pri buđenju.

---

## Baza podataka — PostgreSQL shema

```sql
-- Načini rada
CREATE TABLE mod (
    id      SERIAL PRIMARY KEY,
    naziv   VARCHAR(50) NOT NULL  -- 'pull', 'push', 'timer'
);

INSERT INTO mod (naziv) VALUES ('pull'), ('push'), ('timer');

-- Sesija mjerenja
CREATE TABLE sesija (
    id                  SERIAL PRIMARY KEY,
    mod_id              INT REFERENCES mod(id) NOT NULL,
    threshold           DECIMAL(5,2) NOT NULL,      -- % vlage
    interval_minuta     INT,                         -- za mod 2
    interval_paljenja   INT,                         -- za mod 3 (minute između paljenja)
    trajanje_paljenja   INT,                         -- za mod 3 (sekunde)
    pocetak             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    kraj                TIMESTAMPTZ,
    napomena            TEXT
);

-- Očitavanja senzora
CREATE TABLE ocitavanje (
    id          SERIAL PRIMARY KEY,
    sesija_id   INT REFERENCES sesija(id) NOT NULL,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    vlaga       DECIMAL(5,2) NOT NULL,   -- %
    temperatura DECIMAL(5,2) NOT NULL    -- °C
);

-- Eventi pumpe
CREATE TABLE event_pumpe (
    id          SERIAL PRIMARY KEY,
    sesija_id   INT REFERENCES sesija(id) NOT NULL,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status      BOOLEAN NOT NULL   -- true = ON, false = OFF
);
```

### Korisni upiti za analizu

```sql
-- % vremena ispod thresholda za sesiju
SELECT
    COUNT(*) FILTER (WHERE o.vlaga < s.threshold) * 100.0 / COUNT(*) AS posto_ispod_thresholda
FROM ocitavanje o
JOIN sesija s ON s.id = o.sesija_id
WHERE o.sesija_id = :sesija_id;

-- Ukupno sekundi pumpa bila upaljena
SELECT
    SUM(EXTRACT(EPOCH FROM (
        LEAD(timestamp) OVER (ORDER BY timestamp) - timestamp
    ))) AS sekunde_upaljeno
FROM event_pumpe
WHERE sesija_id = :sesija_id AND status = true;

-- Prosječna vlaga po sesiji
SELECT AVG(vlaga) FROM ocitavanje WHERE sesija_id = :sesija_id;
```

---

## .NET Minimal API — endpointi

```
# Threshold
GET    /api/threshold              → dohvati trenutni threshold iz baze
PUT    /api/threshold              → postavi threshold → spremi u bazu → publish na MQTT retained

# Sesije
POST   /api/sesije/start           → kreiraj sesiju → publish mod/config na MQTT
PUT    /api/sesije/{id}/stop       → zatvori sesiju (kraj = NOW()) → publish stop na MQTT
GET    /api/sesije                 → lista svih sesija
GET    /api/sesije/{id}            → detalji sesije s agregiranim statistikama
GET    /api/sesije/aktivna         → trenutno aktivna sesija (ako postoji)

# Očitavanja (za polling s frontenda)
GET    /api/ocitavanja/latest      → zadnje očitavanje (za dashboard)
GET    /api/sesije/{id}/ocitavanja → sva očitavanja za sesiju (za grafove)
GET    /api/sesije/{id}/eventi     → svi eventi pumpe za sesiju
GET    /api/sesije/{id}/wakeup     → buđenja iz deep sleepa za sesiju (Mod 2/3 — oznake na grafu)

# Dijagnostika senzora (live read, ne sprema u bazu)
POST   /api/senzori/citaj          → publish "read" → čeka svježe očitavanje → vrati vlaga/temp (online/fresh flagovi)

# Pumpa (manual override)
POST   /api/pumpa/on               → publish komandu za paljenje pumpe
POST   /api/pumpa/off              → publish komandu za gašenje pumpe
```

### MQTT Background Service u .NET

API mora imati `IHostedService` koji:
1. Subscribeuje na `navodnjavanje/senzori/#` i `navodnjavanje/pumpa/status`
2. Kad primi poruku → provjeri je li sesija aktivna → spremi u bazu pod tu sesiju
3. Šalje komande pumpi publishujući na `navodnjavanje/pumpa/komanda`

---

## Frontend — stranice

### 1. Dashboard (real-time)
- Trenutna vlaga i temperatura (polling svake 60s + manual refresh gumb)
- Status pumpe (ON/OFF)
- Postavljanje thresholda (input + save gumb)
- Indikator aktivne sesije

### 2. Kontrola sesije
- Odabir moda (1, 2, 3)
- Unos parametara ovisno o modu:
  - Mod 2: interval buđenja (minute)
  - Mod 3: interval paljenja (minute), trajanje paljenja (sekunde)
- Gumb "Započni mjerenje" → POST /api/sesije/start
- Gumb "Završi mjerenje" → PUT /api/sesije/{id}/stop

### 3. Povijest sesija
- Lista svih završenih sesija s osnovnim statistikama
- Klik na sesiju → detalji s grafovima

### 4. Usporedba sesija
- Odabir sesije A i sesije B (dropdown)
- Graf vlage kroz vrijeme (obje sesije na istom grafu, normalizirano na %)
- Crvena horizontalna linija = threshold
- Usporedna tablica:

| Metrika | Sesija A | Sesija B |
|---|---|---|
| Mod rada | pull | push |
| Trajanje | 2h | 2h |
| Ispod thresholda | 4 min | 23 min |
| Pumpa upaljena | 3x | 2x |
| Prosječna vlaga | 67% | 61% |

---

## Mjerenje i usporedba scenarija

### Preciznost navodnjavanja
- Mjeri se: **% vremena kada je vlaga ispod thresholda** po sesiji
- Manji % = precizniji sustav

### Potrošnja energije (ESP32-S3 — aktuatorski uređaj)
- Metoda: Li-Ion baterija 2100mAh, mjeri se koliko dugo traje u svakom modu
- Mod 1: baterija traje X sati → izračun prosječne potrošnje (mA)
- Mod 2: baterija traje Y sati → izračun prosječne potrošnje (mA)
- Mod 3: baterija traje Z sati → izračun prosječne potrošnje (mA)
- Za ubrzano testiranje: skratiti interval deep sleepa i ekstrapolirati

### Reakcijsko vrijeme
- Mod 1: ~0s (stalno aktivan)
- Mod 2: max N minuta (interval buđenja)
- Mod 3: nije primjenjivo (ne reagira na vlagu)

---

## Kalibracija senzora vlage

ESP32 koristi kapacitivni senzor vlage tla. Kalibracija je relativna (za specifičan tip tla):

```cpp
// Izmjeri ove vrijednosti za konkretni senzor i tlo
const int ADC_SUHO = 3200;   // senzor na zraku 24h
const int ADC_MOKRO = 1400;  // senzor u vodi 24h

float vlahaPostotak(int raw) {
    return map(raw, ADC_SUHO, ADC_MOKRO, 0, 100);
}
```

**Napomena:** Kalibracija mora biti konzistentna kroz sva 3 scenarija, inače usporedba nema smisla.

---

## ESP32-S3 — Deep Sleep setup

**Napomena:** ESP32-S3 buđenje iz *deep sleepa* radi preko ugrađenog RTC timera
(`esp_sleep_enable_timer_wakeup`), bez dodatnog ožičenja — za razliku od ESP8266 koji
zahtijeva žicu IO16↔RST.

```cpp
// Mod 2 — osnovna struktura koda
void setup() {
    // Svaki wakeup = reboot, sve ide ovdje
    
    WiFi.begin(SSID, PASSWORD);
    // čekaj konekciju...
    
    mqttClient.connect();
    mqttClient.subscribe("navodnjavanje/config/threshold");  // retained → odmah prima
    mqttClient.subscribe("navodnjavanje/config/mod");
    
    mqttClient.loop();  // čekaj retained poruke (~500ms dovoljno)
    
    // odluka o pumpi
    if (vlahaPostotak < threshold) {
        digitalWrite(RELAY_PIN, HIGH);
        mqttClient.publish("navodnjavanje/pumpa/status", "true");
    }
    
    // publishuj očitavanja
    mqttClient.publish("navodnjavanje/senzori/vlaga", String(vlaga));
    
    // idi spavati
    esp_sleep_enable_timer_wakeup(intervalMinuta * 60ULL * 1000000ULL);  // microsekunde
    esp_deep_sleep_start();
}

void loop() {
    // ne izvršava se u modu 2
}
```

---

## Rokovi

| Datum | Cilj |
|---|---|
| 15.6. | Prva verzija — sva 3 scenarija funkcionalna, frontend osnova, baza |
| Kraj 8. mj. | Finalna verzija — mjerenja, analiza, usporedni grafovi |

### Prioriteti do 15.6.

**Tjedan 1:** MQTT broker (Mosquitto lokalno), ESP32 scenarij 1, osnovna baza shema

**Tjedan 2:** ESP32-S3 deep sleep (scenarij 2), retained messages, .NET API osnova, frontend dashboard

**Tjedan 3:** Scenarij 3, frontend kontrola sesija i povijest, kalibracija senzora

---

## Napomene za rad (što naglasiti u tekstu)

- Polling svake minute je **near real-time**, svjesna arhitekturna odluka
- Retained messages su svjesna odluka za rješavanje race conditiona pri buđenju iz deep sleepa
- Push vs. pull MQTT pattern kao arhitekturna usporedba
- Kalibracija senzora je relativna i specifična za tip tla — konzistentna kroz sve scenarije
- Mjerenje baterije rađeno s ubrzanim ciklusima i ekstrapolacijom na realne intervale
- WiFi reconnect overhead (~2-3s) je mjerljiv i uvrstiti u analizu moda 2
