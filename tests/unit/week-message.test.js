const test = require("node:test");
const assert = require("node:assert/strict");
const { buildWeekMessage } = require("../../public/lib/week-message");

const TEAM = [
  { id: "pedro", name: "Pedro", role: "Custos" },
  { id: "jean", name: "Jean", role: "PCP" },
  { id: "haniel", name: "Haniel", role: "PCP" },
  { id: "gustavo", name: "Gustavo", role: "Qualidade" },
  { id: "bruna", name: "Bruna", role: "Projetos" }
];
const OBRA_BY_ID = {
  almada: { id: "almada", name: "Almada" },
  porto: { id: "porto", name: "Reserva do Porto", shortName: "Porto" },
  palmeiras: { id: "palmeiras", name: "Reserva das Palmeiras", shortName: "Palmeiras" }
};
const WEEK_START = new Date(2026, 9, 25); // domingo
const RANGE = "25/10 a 31/10/2026";

function msg(entries) {
  return buildWeekMessage({ weekStart: WEEK_START, entries: entries, team: TEAM, obraById: OBRA_BY_ID, rangeLabel: RANGE });
}
function e(person, date, obra, extra) { return Object.assign({ id: person + date + obra, person: person, date: date, obra: obra }, extra || {}); }

test("people of the same sector are separated by a blank line, and sectors too", function () {
  const text = msg([
    e("pedro", "2026-10-26", "almada"),
    e("haniel", "2026-10-27", "porto", { comment: "vistoria" }),
    e("haniel", "2026-10-28", "palmeiras"),
    e("jean", "2026-10-27", "almada"),
    e("jean", "2026-10-27", "porto")
  ]);
  assert.equal(text, [
    "📅 *Agenda de Obras — semana de 25/10 a 31/10/2026*",
    "",
    "*Custos*",
    "Pedro",
    "Segunda (26) Almada",
    "",
    "*PCP*",
    "Haniel",
    "Terça (27) Porto (vistoria)",
    "Quarta (28) Palmeiras",
    "",
    "Jean",
    "Terça (27) Almada e Porto"
  ].join("\n"));
});

test("sectors follow the team order even when they appear later in the week", function () {
  const text = msg([e("bruna", "2026-10-26", "almada"), e("pedro", "2026-10-27", "porto")]);
  assert.ok(text.indexOf("*Custos*") < text.indexOf("*Projetos*"));
});

test("an empty week says nobody is scheduled", function () {
  assert.equal(msg([]), "📅 *Agenda de Obras — semana de 25/10 a 31/10/2026*\n\nNinguém marcado nessa semana.");
});

test("entries outside the week and unknown people or obras are ignored", function () {
  const text = msg([e("pedro", "2026-11-02", "almada"), e("ninguem", "2026-10-26", "almada"), e("pedro", "2026-10-26", "inventada")]);
  assert.ok(text.endsWith("Ninguém marcado nessa semana."));
});

test("the text never ends with a line break and never has two blank lines in a row", function () {
  const text = msg([e("pedro", "2026-10-26", "almada"), e("jean", "2026-10-27", "porto"), e("gustavo", "2026-10-28", "almada")]);
  assert.equal(text, text.trim());
  assert.ok(text.indexOf("\n\n\n") === -1);
});

test("the week may cross a month boundary", function () {
  const text = buildWeekMessage({
    weekStart: new Date(2026, 9, 25), entries: [e("pedro", "2026-10-31", "almada")], team: TEAM, obraById: OBRA_BY_ID, rangeLabel: RANGE
  });
  assert.ok(text.includes("Sábado (31) Almada"));
});

test("a meeting goes right after the obra name, before the comment", function () {
  const text = msg([
    e("jean", "2026-10-28", "porto", { meeting: { start: "14:00", end: "15:30" }, comment: "pauta" }),
    e("jean", "2026-10-29", "almada", { meeting: { start: "09:00", end: "10:00" } })
  ]);
  assert.ok(text.includes("Quarta (28) Porto, reunião 14h–15h30 (pauta)"), text);
  assert.ok(text.includes("Quinta (29) Almada, reunião 9h–10h"), text);
});
