const BASE = "/api";

async function req(path, options) {
  const res = await fetch(BASE + path, options);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json().catch(() => null);
}

export const getLatest = () => req("/ocitavanja/latest");
export const getThreshold = () => req("/threshold");
export const setThreshold = (threshold) =>
  req("/threshold", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threshold }),
  });

export const getSesije = () => req("/sesije");
export const getAktivnaSesija = () => req("/sesije/aktivna").catch(() => null);
export const getSesija = (id) => req(`/sesije/${id}`);
export const startSesija = (body) =>
  req("/sesije/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const stopSesija = (id) => req(`/sesije/${id}/stop`, { method: "PUT" });
export const deleteSesija = (id) => req(`/sesije/${id}`, { method: "DELETE" });

export const getOcitavanja = (id) => req(`/sesije/${id}/ocitavanja`);
export const getEventi = (id) => req(`/sesije/${id}/eventi`);
export const getBaterija = (id) => req(`/sesije/${id}/baterija`);
export const getWakeup = (id) => req(`/sesije/${id}/wakeup`);

export const pumpaOn = () => req("/pumpa/on", { method: "POST" });
export const pumpaOff = () => req("/pumpa/off", { method: "POST" });

export const getUredajiStatus = () => req("/uredaji/status");

export const citajSenzor = () => req("/senzori/citaj", { method: "POST" });
