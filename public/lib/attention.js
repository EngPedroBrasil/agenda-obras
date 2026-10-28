// Counts visits per person and obra for the "Atenção" view. Pure, shared by the page
// (window.Attention) and the unit tests (require). Dates are "AAAA-MM-DD" strings.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Attention = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function utc(key) {
    var p = key.split("-").map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]);
  }

  function daysBetween(fromKey, toKey) {
    return Math.round((utc(toKey) - utc(fromKey)) / 86400000);
  }

  function addDaysKey(key, n) {
    var d = new Date(utc(key) + n * 86400000);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }

  function periodStartFor(todayKey, period) {
    if (period === "month") return todayKey.slice(0, 8) + "01";
    return addDaysKey(todayKey, -(Number(period) - 1));
  }

  // opts: { entries, today, periodStart, obraOrder, personOrder, staleDays = 14 }
  function buildAttention(opts) {
    var staleDays = opts.staleDays === undefined ? 14 : opts.staleDays;
    var rowsByObra = {};
    var personTotals = {};
    opts.personOrder.forEach(function (p) { personTotals[p] = { done: 0, planned: 0 }; });

    var rows = opts.obraOrder.map(function (obra) {
      var byPerson = {};
      opts.personOrder.forEach(function (p) { byPerson[p] = { done: 0, planned: 0 }; });
      var row = { obra: obra, byPerson: byPerson, done: 0, planned: 0, lastVisit: null, daysSinceLast: null, nextVisit: null, stale: true, noPlan: true };
      rowsByObra[obra] = row;
      return row;
    });

    opts.entries.forEach(function (en) {
      var row = rowsByObra[en.obra];
      if (!row || !personTotals[en.person]) return;
      var cell = row.byPerson[en.person];
      if (en.date > opts.today) {
        cell.planned += 1; row.planned += 1; personTotals[en.person].planned += 1;
        if (row.nextVisit === null || en.date < row.nextVisit) row.nextVisit = en.date;
      } else {
        if (row.lastVisit === null || en.date > row.lastVisit) row.lastVisit = en.date;
        if (en.date >= opts.periodStart) {
          cell.done += 1; row.done += 1; personTotals[en.person].done += 1;
        }
      }
    });

    rows.forEach(function (row) {
      row.daysSinceLast = row.lastVisit === null ? null : daysBetween(row.lastVisit, opts.today);
      row.stale = row.lastVisit === null || row.daysSinceLast > staleDays;
      row.noPlan = row.planned === 0;
    });

    return { rows: rows, personTotals: personTotals };
  }

  return { daysBetween: daysBetween, periodStartFor: periodStartFor, buildAttention: buildAttention };
});
