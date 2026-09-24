"use strict";

const PEOPLE_IDS = ["pedro", "jean", "haniel", "gustavo", "bruna"];
const OBRA_IDS = ["almada", "montebello", "miraggio", "palmeiras", "tulipas", "porto"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_COMMENT_LENGTH = 140;

function validateComment(value) {
  if (value === undefined || value === null) return { ok: true };
  if (typeof value !== "string") {
    return { ok: false, error: "comentário inválido" };
  }
  if (value.trim().length > MAX_COMMENT_LENGTH) {
    return { ok: false, error: "comentário muito longo (máximo " + MAX_COMMENT_LENGTH + " caracteres)" };
  }
  return { ok: true };
}

function normalizeComment(value) {
  return typeof value === "string" ? value.trim() : "";
}

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
  return validateComment(input.comment);
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

// Returns a new array with the entry's comment set (or removed when blank),
// or null when no entry has that id.
function updateEntryComment(entries, id, comment) {
  var text = normalizeComment(comment);
  var found = false;
  var updated = entries.map(function (en) {
    if (en.id !== id) return en;
    found = true;
    var copy = Object.assign({}, en);
    if (text) copy.comment = text; else delete copy.comment;
    return copy;
  });
  return found ? updated : null;
}

module.exports = {
  PEOPLE_IDS, OBRA_IDS,
  validateEntry, validateComment, normalizeComment,
  addEntry, removeEntry, updateEntryComment
};
