"use strict";

// In-memory stand-in for a Netlify Blobs store.
function makeFakeStore(initialEntries, extra) {
  const data = Object.assign({ entries: initialEntries }, extra || {});
  return {
    data: data,
    get: async function (key) { return data[key] === undefined ? null : data[key]; },
    setJSON: async function (key, value) { data[key] = JSON.parse(JSON.stringify(value)); },
    delete: async function (key) { delete data[key]; },
    list: async function (opts) {
      const prefix = (opts && opts.prefix) || "";
      return { blobs: Object.keys(data).filter(function (k) { return k.indexOf(prefix) === 0; }).map(function (k) { return { key: k }; }) };
    }
  };
}

module.exports = { makeFakeStore };
