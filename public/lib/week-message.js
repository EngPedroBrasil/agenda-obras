// Builds the WhatsApp text for one week. Pure, shared by the page (window.WeekMessage)
// and the unit tests (require).
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./meeting-format"));
  } else {
    root.WeekMessage = factory(root.MeetingFormat);
  }
})(typeof self !== "undefined" ? self : this, function (MeetingFormat) {
  var WEEKDAY_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function keyOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  // opts: { weekStart: Date, entries, team, obraById, rangeLabel }
  function buildWeekMessage(opts) {
    var sectorOrder = [];
    var sectors = {};
    var personById = {};
    opts.team.forEach(function (p) {
      personById[p.id] = p;
      if (!sectors[p.role]) { sectors[p.role] = { peopleOrder: [], people: {} }; sectorOrder.push(p.role); }
    });

    for (var i = 0; i < 7; i++) {
      var d = new Date(opts.weekStart.getFullYear(), opts.weekStart.getMonth(), opts.weekStart.getDate() + i);
      var key = keyOf(d);
      var dayLabel = WEEKDAY_FULL[d.getDay()] + " (" + pad(d.getDate()) + ")";
      opts.entries.filter(function (en) { return en.date === key; }).forEach(function (en) {
        var person = personById[en.person], obra = opts.obraById[en.obra];
        if (!person || !obra) return;
        var sector = sectors[person.role];
        if (!sector.people[person.id]) {
          sector.people[person.id] = { name: person.name, dayOrder: [], days: {} };
          sector.peopleOrder.push(person.id);
        }
        var pdata = sector.people[person.id];
        if (!pdata.days[dayLabel]) { pdata.days[dayLabel] = []; pdata.dayOrder.push(dayLabel); }
        var meeting = MeetingFormat.formatMeetingShort(en.meeting);
        pdata.days[dayLabel].push((obra.shortName || obra.name) + (meeting ? ", reunião " + meeting : "") + (en.comment ? " (" + en.comment + ")" : ""));
      });
    }

    var lines = ["📅 *Agenda de Obras — semana de " + opts.rangeLabel + "*", ""];
    var anyEntry = false;
    sectorOrder.forEach(function (role) {
      var sector = sectors[role];
      if (!sector.peopleOrder.length) return;
      anyEntry = true;
      lines.push("*" + role + "*");
      sector.peopleOrder.forEach(function (pid) {
        var pdata = sector.people[pid];
        lines.push(pdata.name);
        pdata.dayOrder.forEach(function (dayLabel) {
          lines.push(dayLabel + " " + pdata.days[dayLabel].join(" e "));
        });
        lines.push("");
      });
    });
    if (!anyEntry) lines.push("Ninguém marcado nessa semana.");
    return lines.join("\n").trim();
  }

  return { buildWeekMessage: buildWeekMessage };
});
