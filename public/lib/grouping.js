// Pure grouping helpers shared by the page (window.Grouping) and the unit tests (require).
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Grouping = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  // Groups one day's entries by obra. Groups follow obraOrder, people inside a
  // group follow personOrder; obras nobody is marked at are left out, and entries
  // with an unknown obra or person id are skipped.
  function groupByObra(dayEntries, obraOrder, personOrder) {
    var byObra = {};
    dayEntries.forEach(function (en) {
      if (obraOrder.indexOf(en.obra) === -1 || personOrder.indexOf(en.person) === -1) return;
      if (!byObra[en.obra]) byObra[en.obra] = {};
      if (!byObra[en.obra][en.person]) byObra[en.obra][en.person] = en;
    });
    var groups = [];
    obraOrder.forEach(function (obraId) {
      if (!byObra[obraId]) return;
      var people = [];
      personOrder.forEach(function (personId) {
        var en = byObra[obraId][personId];
        if (!en) return;
        var entry = { person: personId };
        if (en.comment) entry.comment = en.comment;
        people.push(entry);
      });
      groups.push({ obra: obraId, people: people });
    });
    return groups;
  }

  return { groupByObra: groupByObra };
});
