"use strict";

const { getStore } = require("@netlify/blobs");
const { validateEntry, addEntry, removeEntry } = require("./lib/entries-logic");

const STORE_NAME = "agenda-obras";
const BLOB_KEY = "entries";

function jsonResponse(statusCode, bodyObj) {
  return {
    statusCode: statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(bodyObj)
  };
}

function makeHandler(store) {
  return async function handler(event) {
    if (event.httpMethod === "GET") {
      const current = (await store.get(BLOB_KEY, { type: "json" })) || [];
      return jsonResponse(200, { entries: current });
    }

    if (event.httpMethod === "POST") {
      let payload;
      try {
        payload = JSON.parse(event.body || "{}");
      } catch (e) {
        return jsonResponse(400, { error: "JSON inválido" });
      }

      const current = (await store.get(BLOB_KEY, { type: "json" })) || [];

      if (payload.op === "remove") {
        if (typeof payload.id !== "string" || !payload.id) {
          return jsonResponse(400, { error: "id obrigatório para remover" });
        }
        const updated = removeEntry(current, payload.id);
        await store.setJSON(BLOB_KEY, updated);
        return jsonResponse(200, { entries: updated });
      }

      if (payload.op === "add") {
        const check = validateEntry(payload);
        if (!check.ok) {
          return jsonResponse(400, { error: check.error });
        }
        const entryWithId = {
          id: "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          date: payload.date,
          person: payload.person,
          obra: payload.obra,
          createdAt: new Date().toISOString()
        };
        const updated = addEntry(current, entryWithId);
        await store.setJSON(BLOB_KEY, updated);
        return jsonResponse(200, { entries: updated });
      }

      return jsonResponse(400, { error: "op inválida (esperado 'add' ou 'remove')" });
    }

    return jsonResponse(405, { error: "método não suportado" });
  };
}

function resolveStore() {
  if (process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN) {
    return getStore({
      name: STORE_NAME,
      siteID: process.env.BLOBS_SITE_ID,
      token: process.env.BLOBS_TOKEN
    });
  }
  return getStore(STORE_NAME);
}

exports.handler = async function (event, context) {
  return makeHandler(resolveStore())(event, context);
};
exports.makeHandler = makeHandler;
