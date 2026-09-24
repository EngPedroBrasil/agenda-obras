// Builds the data behind the weekly image: seven days (from weekStart) with weekend
// flag, holidays and the items to draw. Pure, shared by the page (window.WeekModel)
// and the unit tests (require).
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./grouping"));
  } else {
    root.WeekModel = factory(root.Grouping);
  }
})(typeof self !== "undefined" ? self : this, function (Grouping) {
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function keyOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  // One item per person+obra, ordered by team then obra order; unknown ids skipped.
  function personItems(dayEntries, obraOrder, personOrder) {
    var items = [];
    personOrder.forEach(function (personId) {
      obraOrder.forEach(function (obraId) {
        var en = dayEntries.filter(function (e) { return e.person === personId && e.obra === obraId; })[0];
        if (!en) return;
        var item = { person: personId, obra: obraId };
        if (en.comment) item.comment = en.comment;
        items.push(item);
      });
    });
    return items;
  }

  // opts: { weekStart: Date, entries, groupBy: "person"|"obra", obraOrder, personOrder,
  //         holidaysFor?: function(Date) -> [{type,label}] }
  function buildWeekModel(opts) {
    var days = [];
    for (var i = 0; i < 7; i++) {
      var date = new Date(opts.weekStart.getFullYear(), opts.weekStart.getMonth(), opts.weekStart.getDate() + i);
      var key = keyOf(date);
      var dayEntries = opts.entries.filter(function (e) { return e.date === key; });
      days.push({
        key: key,
        date: date,
        weekday: date.getDay(),
        dayOfMonth: date.getDate(),
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
        holidays: opts.holidaysFor ? opts.holidaysFor(date) : [],
        items: opts.groupBy === "obra"
          ? Grouping.groupByObra(dayEntries, opts.obraOrder, opts.personOrder)
          : personItems(dayEntries, opts.obraOrder, opts.personOrder)
      });
    }
    return days;
  }

  return { buildWeekModel: buildWeekModel };
});
