"use strict";

const crypto = require("crypto");

const MAX_TEXT = 500;
const MAX_STORED = 500;
const READ_TTL_MS = 60 * 24 * 60 * 60 * 1000;

function fail(status, error) {
  return { ok: false, status: status, error: error };
}

function validateSend(payload, senderId, people) {
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) return fail(400, "escreva a mensagem");
  if (text.length > MAX_TEXT) return fail(400, "mensagem longa demais (máximo " + MAX_TEXT + " caracteres)");
  if (!Array.isArray(payload.to) || payload.to.length === 0) return fail(400, "escolha pelo menos uma pessoa");
  const valid = people.map(function (p) { return p.id; });
  const to = [];
  for (var i = 0; i < payload.to.length; i++) {
    const id = payload.to[i];
    if (typeof id !== "string" || valid.indexOf(id) < 0 || id === senderId) return fail(400, "destinatário inválido");
    if (to.indexOf(id) < 0) to.push(id);
  }
  return { ok: true, text: text, to: to };
}

function buildNotices(from, to, text, nowIso) {
  return to.map(function (recipient) {
    return { id: crypto.randomBytes(8).toString("hex"), from: from, to: recipient, text: text, createdAt: nowIso, readAt: null };
  });
}

// Remove avisos lidos há mais de 60 dias, junta os novos e limita o total guardado.
function addNotices(list, created, nowMs) {
  const kept = list.filter(function (n) {
    return !n.readAt || nowMs - Date.parse(n.readAt) <= READ_TTL_MS;
  });
  const all = kept.concat(created);
  return all.length > MAX_STORED ? all.slice(all.length - MAX_STORED) : all;
}

function inboxFor(list, userId) {
  return list.filter(function (n) { return n.to === userId; }).reverse();
}

function sentBy(list, userId) {
  return list.filter(function (n) { return n.from === userId; }).reverse();
}

function markRead(list, id, userId, nowIso) {
  const index = list.findIndex(function (n) { return n.id === id && n.to === userId; });
  if (index < 0) return fail(404, "aviso não encontrado");
  if (list[index].readAt) return { ok: true, list: list, changed: false };
  const next = list.slice();
  next[index] = Object.assign({}, list[index], { readAt: nowIso });
  return { ok: true, list: next, changed: true };
}

module.exports = { MAX_TEXT, MAX_STORED, READ_TTL_MS, validateSend, buildNotices, addNotices, inboxFor, sentBy, markRead };
