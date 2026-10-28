"use strict";

function deny(status, error) {
  return { ok: false, status: status, error: error };
}

const OWN = "você só pode alterar as suas próprias marcações";

function authorize(user, payload, entries) {
  if (!user) return deny(401, "faça login para alterar a agenda");
  if (user.mustChange) return deny(403, "troque a senha antes de alterar a agenda");
  if (user.role === "manager") return deny(403, "o gestor acompanha a agenda, mas não altera marcações");
  if (user.role === "admin") return { ok: true };

  function own(person) {
    return person === user.id ? { ok: true } : deny(403, OWN);
  }

  switch (payload.op) {
    case "add":
    case "confirmWeek":
    case "unconfirmWeek":
      return own(payload.person);
    case "addMany": {
      if (!Array.isArray(payload.items)) return { ok: true };
      for (var i = 0; i < payload.items.length; i++) {
        var item = payload.items[i];
        if (!item || item.person !== user.id) return deny(403, OWN);
      }
      return { ok: true };
    }
    case "update":
    case "remove": {
      var entry = (entries || []).filter(function (en) { return en.id === payload.id; })[0];
      return entry ? own(entry.person) : { ok: true };
    }
    default:
      return { ok: true };
  }
}

module.exports = { authorize };
