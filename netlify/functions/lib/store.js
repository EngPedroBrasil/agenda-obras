"use strict";

const STORE_NAME = "agenda-obras";
const LOCAL_STORE_NAME = "agenda-obras-dev";

// `netlify dev` can inherit the site's variables (BLOBS_SITE_ID/BLOBS_TOKEN) and point
// at the production database. In a local environment we deliberately ignore them.
function isLocalEnv(env) {
  return env.NETLIFY_DEV === "true" || env.AGENDA_LOCAL === "1";
}

function storeConfigFor(env) {
  if (isLocalEnv(env)) return { name: LOCAL_STORE_NAME };
  if (env.BLOBS_SITE_ID && env.BLOBS_TOKEN) {
    return { name: STORE_NAME, siteID: env.BLOBS_SITE_ID, token: env.BLOBS_TOKEN };
  }
  return { name: STORE_NAME };
}

// Same four methods the functions use from Netlify Blobs (get, setJSON, delete, list),
// backed by JSON files. Used in local environments, where Blobs is not configured
// (`netlify dev --offline`) and where production must never be touched anyway.
function makeFileStore(dir) {
  const fs = require("fs");
  const path = require("path");
  fs.mkdirSync(dir, { recursive: true });
  const fileFor = function (key) { return path.join(dir, encodeURIComponent(key) + ".json"); };
  return {
    get: async function (key) {
      try { return JSON.parse(fs.readFileSync(fileFor(key), "utf8")); }
      catch (e) { if (e.code === "ENOENT") return null; throw e; }
    },
    setJSON: async function (key, value) { fs.writeFileSync(fileFor(key), JSON.stringify(value)); },
    delete: async function (key) {
      try { fs.unlinkSync(fileFor(key)); } catch (e) { if (e.code !== "ENOENT") throw e; }
    },
    list: async function (opts) {
      const prefix = (opts && opts.prefix) || "";
      const keys = fs.readdirSync(dir)
        .filter(function (name) { return name.slice(-5) === ".json"; })
        .map(function (name) { return decodeURIComponent(name.slice(0, -5)); })
        .filter(function (key) { return key.indexOf(prefix) === 0; });
      return { blobs: keys.map(function (key) { return { key: key }; }) };
    }
  };
}

function localDataDir() {
  return require("path").join(__dirname, "..", "..", "..", ".netlify", "local-data");
}

function resolveStore(env) {
  env = env || process.env;
  if (isLocalEnv(env)) return makeFileStore(localDataDir());
  const { getStore } = require("@netlify/blobs");
  const config = storeConfigFor(env);
  return config.siteID ? getStore(config) : getStore(config.name);
}

module.exports = { STORE_NAME, LOCAL_STORE_NAME, isLocalEnv, storeConfigFor, makeFileStore, localDataDir, resolveStore };
