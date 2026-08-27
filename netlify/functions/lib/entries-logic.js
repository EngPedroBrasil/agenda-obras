"use strict";

const PEOPLE_IDS = ["pedro", "jean", "haniel", "gustavo", "bruna"];
const OBRA_IDS = ["almada", "montebello", "miraggio", "palmeiras", "tulipas", "porto"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateEntry(input) {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "corpo inválido" };
  }
  if (typeof input.date !== "string" || !DATE_RE.test(input.date)) {
    return { ok: false, error: "data inválida (esperado AAAA-MM-DD)" };
  }
  if (!PEOPLE_IDS.includes(input.person)) {
    return { ok: false, error: "pessoa inválida" };
  }
  if (!OBRA_IDS.includes(input.obra)) {
    return { ok: false, error: "obra inválida" };
  }
  return { ok: true };
}

function addEntry(entries, entryWithId) {
  var dup = entries.some(function (en) {
    return en.date === entryWithId.date && en.person === entryWithId.person && en.obra === entryWithId.obra;
  });
  if (dup) return entries;
  return entries.concat([entryWithId]);
}

function removeEntry(entries, id) {
  return entries.filter(function (en) { return en.id !== id; });
}

module.exports = { PEOPLE_IDS, OBRA_IDS, validateEntry, addEntry, removeEntry };
