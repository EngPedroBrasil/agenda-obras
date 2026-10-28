"use strict";

const PREFIX = "backup-";
const KEEP_DEFAULT = 30;
const DAILY_RE = /^backup-\d{4}-\d{2}-\d{2}$/;
const PRERESTORE_PREFIX = "backup-prerestore-";
const RESTORABLE_RE = /^backup-(\d{4}-\d{2}-\d{2}|prerestore-[0-9TZ-]+)$/;

function dayKeySP(nowMs) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(nowMs));
}

function keysToPrune(keys, keep) {
  const daily = keys.filter(function (k) { return DAILY_RE.test(k); }).sort();
  return daily.length > keep ? daily.slice(0, daily.length - keep) : [];
}

function buildExport(entries, weeks, nowMs) {
  return { exportedAt: new Date(nowMs).toISOString(), entries: entries, weeks: weeks };
}

async function readState(store) {
  const entries = (await store.get("entries", { type: "json" })) || [];
  const weeks = (await store.get("weeks", { type: "json" })) || {};
  return { entries: entries, weeks: weeks };
}

async function ensureDailySnapshot(store, nowMs, keep) {
  const key = PREFIX + dayKeySP(nowMs);
  if (await store.get(key, { type: "json" })) return false;
  const state = await readState(store);
  await store.setJSON(key, { createdAt: new Date(nowMs).toISOString(), entries: state.entries, weeks: state.weeks });
  const listing = await store.list({ prefix: PREFIX });
  const old = keysToPrune(listing.blobs.map(function (b) { return b.key; }), keep || KEEP_DEFAULT);
  for (var i = 0; i < old.length; i++) await store.delete(old[i]);
  return true;
}

function labelFor(key) {
  if (DAILY_RE.test(key)) {
    var p = key.slice(PREFIX.length).split("-");
    return "Diário " + p[2] + "/" + p[1] + "/" + p[0];
  }
  return "Antes de uma restauração (" + key.slice(PRERESTORE_PREFIX.length) + ")";
}

async function listBackups(store) {
  const listing = await store.list({ prefix: PREFIX });
  return listing.blobs
    .map(function (b) { return b.key; })
    .filter(function (k) { return RESTORABLE_RE.test(k); })
    .sort()
    .reverse()
    .map(function (k) {
      return { id: k, kind: DAILY_RE.test(k) ? "daily" : "prerestore", label: labelFor(k) };
    });
}

async function restoreSnapshot(store, id, nowMs) {
  if (typeof id !== "string" || !RESTORABLE_RE.test(id)) {
    return { ok: false, status: 400, error: "backup inválido" };
  }
  const snapshot = await store.get(id, { type: "json" });
  if (!snapshot || !Array.isArray(snapshot.entries)) {
    return { ok: false, status: 404, error: "backup não encontrado" };
  }
  const current = await readState(store);
  const preKey = PRERESTORE_PREFIX + new Date(nowMs).toISOString().replace(/[:.]/g, "-");
  await store.setJSON(preKey, { createdAt: new Date(nowMs).toISOString(), entries: current.entries, weeks: current.weeks });
  await store.setJSON("entries", snapshot.entries);
  await store.setJSON("weeks", snapshot.weeks || {});
  return { ok: true };
}

module.exports = { dayKeySP, keysToPrune, buildExport, readState, ensureDailySnapshot, listBackups, restoreSnapshot };
