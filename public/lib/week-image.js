// Draws the weekly schedule card as a PNG (canvas). Browser-only; always uses the light
// brand palette (positive logo on white) regardless of the page theme.
// The data comes from WeekModel.buildWeekModel; nothing here decides *what* is shown.
(function (root) {
  var W = 1600, SCALE = 2, PAD = 40, GAP = 14, COL_MIN_H = 220;
  var FONT = 'Mulish, system-ui, "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  var C = {
    bg: "#ffffff", ink: "#3c3c3b", soft: "#6b6b67", faint: "#97968f", border: "#d9ddd0",
    card: "#f3f5ee", weekend: "#eaeee0", accent: "#51ae32"
  };
  var HOL = {
    nat: { fg: "#a0442e", bg: "#f6e2dc" },
    cur: { fg: "#2e6f8e", bg: "#dcebf1" },
    fac: { fg: "#8a7f5c", bg: "#efe9d8" }
  };
  var WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

  function font(ctx, weight, size, italic) {
    ctx.font = (italic ? "italic " : "") + weight + " " + size + "px " + FONT;
  }

  function loadImage(src) {
    return new Promise(function (resolve) {
      if (!src) { resolve(null); return; }
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function loadFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load("800 34px Mulish"), document.fonts.load("700 17px Mulish"),
      document.fonts.load("500 14px Mulish"), document.fonts.load("400 13px Mulish")
    ]).catch(function () { /* fall back to system-ui */ });
  }

  // Greedy word wrap; a single word wider than maxW is split by characters.
  function wrap(ctx, text, maxW) {
    var lines = [], line = "";
    String(text).split(/\s+/).forEach(function (word) {
      var test = line ? line + " " + word : word;
      if (ctx.measureText(test).width <= maxW) { line = test; return; }
      if (line) { lines.push(line); line = ""; }
      while (ctx.measureText(word).width > maxW && word.length > 1) {
        var cut = word.length - 1;
        while (cut > 1 && ctx.measureText(word.slice(0, cut)).width > maxW) cut--;
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      line = word;
    });
    if (line) lines.push(line);
    return lines;
  }

  function roundPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function circleImage(ctx, img, x, y, size) {
    if (!img) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
  }

  function cardBackground(ctx, x, y, w, h, color) {
    ctx.save();
    roundPath(ctx, x, y, w, h, 8);
    ctx.fillStyle = C.card;
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 5, h);
    ctx.restore();
  }

  // Each block measures its height and draws only when `draw` is true.
  function personChip(ctx, x, y, w, item, o, draw) {
    var obra = o.obraById[item.obra], person = o.personById[item.person];
    var textX = x + 5 + 9 + 22 + 8, textW = w - (textX - x) - 9;
    var innerX = x + 5 + 9, innerW = w - 5 - 9 - 9;
    var lines = [];
    if (item.comment) { font(ctx, 400, 13, true); lines = wrap(ctx, item.comment, innerW); }
    var h = 9 + 21 + 18 + (lines.length ? 4 + lines.length * 17 : 0) + 9;
    if (!draw) return h;
    cardBackground(ctx, x, y, w, h, obra.color);
    circleImage(ctx, o.icons[item.obra], x + 5 + 9, y + 9, 22);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.ink; font(ctx, 700, 17);
    ctx.fillText(person.name, textX, y + 9 + 16, textW);
    ctx.fillStyle = C.soft; font(ctx, 500, 14);
    ctx.fillText(obra.shortName || obra.name, textX, y + 9 + 21 + 13, textW);
    ctx.fillStyle = C.soft; font(ctx, 400, 13, true);
    lines.forEach(function (ln, i) { ctx.fillText(ln, innerX, y + 9 + 21 + 18 + 4 + 13 + i * 17); });
    return h;
  }

  function obraCard(ctx, x, y, w, group, o, draw) {
    var obra = o.obraById[group.obra];
    var innerX = x + 5 + 9, innerW = w - 5 - 9 - 9;
    var rows = group.people.map(function (p) {
      font(ctx, 400, 13, true);
      return { name: o.personById[p.person].name, lines: p.comment ? wrap(ctx, p.comment, innerW) : [] };
    });
    var h = 9 + 22 + 6;
    rows.forEach(function (r) { h += 20 + (r.lines.length ? r.lines.length * 17 : 0) + 4; });
    h += 5;
    if (!draw) return h;
    cardBackground(ctx, x, y, w, h, obra.color);
    circleImage(ctx, o.icons[group.obra], x + 5 + 9, y + 9, 22);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.ink; font(ctx, 700, 17);
    ctx.fillText(obra.shortName || obra.name, x + 5 + 9 + 22 + 8, y + 9 + 17, w - 5 - 9 - 22 - 8 - 9);
    var cy = y + 9 + 22 + 6;
    rows.forEach(function (r) {
      ctx.fillStyle = C.ink; font(ctx, 700, 15);
      ctx.fillText(r.name, innerX, cy + 15, innerW);
      cy += 20;
      ctx.fillStyle = C.soft; font(ctx, 400, 13, true);
      r.lines.forEach(function (ln) { ctx.fillText(ln, innerX, cy + 12); cy += 17; });
      cy += 4;
    });
    return h;
  }

  // Draws (or measures) one day column; returns the content height.
  function column(ctx, x, y, w, minH, day, o, draw) {
    var innerX = x + 12, innerW = w - 24, cy = y + 12;
    if (draw) {
      roundPath(ctx, x, y, w, minH, 12);
      ctx.fillStyle = day.isWeekend ? C.weekend : C.bg;
      ctx.fill();
      ctx.strokeStyle = C.border; ctx.lineWidth = 1; ctx.stroke();
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = day.isWeekend ? C.accent : C.faint; font(ctx, 700, 13);
      ctx.fillText(WEEKDAYS[day.weekday], innerX, cy + 24);
      ctx.textAlign = "right";
      ctx.fillStyle = day.isWeekend ? C.accent : C.ink; font(ctx, 800, 26);
      ctx.fillText(String(day.dayOfMonth), x + w - 12, cy + 26);
      ctx.textAlign = "left";
    }
    cy += 36;
    day.holidays.forEach(function (hd) {
      var col = HOL[hd.type] || HOL.fac;
      font(ctx, 700, 12);
      var lines = wrap(ctx, hd.label, innerW - 12), bh = lines.length * 15 + 8;
      if (draw) {
        roundPath(ctx, innerX, cy, innerW, bh, 6); ctx.fillStyle = col.bg; ctx.fill();
        ctx.fillStyle = col.fg; font(ctx, 700, 12);
        lines.forEach(function (ln, i) { ctx.fillText(ln, innerX + 6, cy + 4 + 12 + i * 15); });
      }
      cy += bh + 6;
    });
    if (day.holidays.length) cy += 2;
    day.items.forEach(function (item) {
      var hh = o.groupBy === "obra" ? obraCard(ctx, innerX, cy, innerW, item, o, draw) : personChip(ctx, innerX, cy, innerW, item, o, draw);
      cy += hh + 8;
    });
    return cy - y + 4;
  }

  // opts: { days, groupBy, title, subtitle, obraById, personById, logoSrc }
  function render(opts) {
    var ids = Object.keys(opts.obraById);
    return Promise.all([loadFonts(), loadImage(opts.logoSrc)].concat(ids.map(function (id) { return loadImage(opts.obraById[id].icon); })))
      .then(function (loaded) {
        var logo = loaded[1], icons = {};
        ids.forEach(function (id, i) { icons[id] = loaded[2 + i]; });
        var o = { groupBy: opts.groupBy, obraById: opts.obraById, personById: opts.personById, icons: icons };
        var colW = (W - 2 * PAD - 6 * GAP) / 7;
        var measure = document.createElement("canvas").getContext("2d");
        var colH = Math.max.apply(null, opts.days.map(function (d) { return column(measure, 0, 0, colW, 0, d, o, false); }).concat([COL_MIN_H]));
        var headerH = 84, top = PAD + headerH;
        var H = top + colH + PAD;
        var canvas = document.createElement("canvas");
        canvas.width = W * SCALE; canvas.height = H * SCALE;
        var ctx = canvas.getContext("2d");
        ctx.scale(SCALE, SCALE);
        ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
        var tx = PAD;
        if (logo) {
          var lh = 60, lw = lh * logo.width / logo.height;
          ctx.drawImage(logo, PAD, PAD, lw, lh);
          tx = PAD + lw + 18;
        }
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = C.ink; font(ctx, 800, 36);
        ctx.fillText(opts.title, tx, PAD + 30);
        ctx.fillStyle = C.soft; font(ctx, 500, 20);
        ctx.fillText(opts.subtitle, tx, PAD + 58);
        opts.days.forEach(function (d, i) {
          column(ctx, PAD + i * (colW + GAP), top, colW, colH, d, o, true);
        });
        return canvas;
      });
  }

  function toBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error("toBlob failed")); }, "image/png");
    });
  }

  root.WeekImage = { render: render, toBlob: toBlob };
})(typeof self !== "undefined" ? self : this);
