"use strict";

const { isRealDate, PEOPLE_IDS } = require("./entries-logic");

function pad(n) { return (n < 10 ? "0" : "") + n; }

function parts(key) { return key.split("-").map(Number); }

function dayOfWeekUTC(key) {
  var p = parts(key);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
}

function isSunday(key) {
  return isRealDate(key) && dayOfWeekUTC(key) === 0;
}

// The Sunday that starts the week containing `dateKey` (the calendar starts on Sunday).
function weekKeyOf(dateKey) {
  var p = parts(dateKey);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] - dayOfWeekUTC(dateKey)));
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
}

function validateWeekOp(payload) {
  if (!isSunday(payload.week)) {
    return { ok: false, error: "semana inválida (esperado o domingo, AAAA-MM-DD)" };
  }
  if (!PEOPLE_IDS.includes(payload.person)) {
    return { ok: false, error: "pessoa inválida" };
  }
  return { ok: true };
}

// All three return the very same object when nothing changes.
function confirmWeek(weeks, week, person, iso) {
  if (weeks[week] && weeks[week][person]) return weeks;
  var next = Object.assign({}, weeks);
  next[week] = Object.assign({}, weeks[week]);
  next[week][person] = iso;
  return next;
}

function unconfirmWeek(weeks, week, person) {
  if (!weeks[week] || !weeks[week][person]) return weeks;
  var next = Object.assign({}, weeks);
  var inner = Object.assign({}, weeks[week]);
  delete inner[person];
  if (Object.keys(inner).length) next[week] = inner; else delete next[week];
  return next;
}

function reopenForEntries(weeks, affected) {
  return affected.reduce(function (acc, item) {
    return unconfirmWeek(acc, weekKeyOf(item.date), item.person);
  }, weeks);
}

module.exports = { isSunday, weekKeyOf, validateWeekOp, confirmWeek, unconfirmWeek, reopenForEntries };
