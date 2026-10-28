// Formats a meeting window ({start:"HH:MM", end:"HH:MM"}) for display. Pure, shared by the
// page (window.MeetingFormat) and the unit tests (require).
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MeetingFormat = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

  function valid(m) {
    return !!m && typeof m.start === "string" && typeof m.end === "string" && TIME_RE.test(m.start) && TIME_RE.test(m.end);
  }

  function short(hhmm) {
    var p = TIME_RE.exec(hhmm);
    var hour = String(Number(p[1]));
    return p[2] === "00" ? hour + "h" : hour + "h" + p[2];
  }

  function formatMeetingShort(m) {
    return valid(m) ? short(m.start) + "–" + short(m.end) : "";
  }

  function formatMeetingClock(m) {
    return valid(m) ? m.start + "–" + m.end : "";
  }

  return { formatMeetingShort: formatMeetingShort, formatMeetingClock: formatMeetingClock };
});
