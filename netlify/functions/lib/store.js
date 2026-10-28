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

function resolveStore(env) {
  const { getStore } = require("@netlify/blobs");
  const config = storeConfigFor(env || process.env);
  return config.siteID ? getStore(config) : getStore(config.name);
}

module.exports = { STORE_NAME, LOCAL_STORE_NAME, isLocalEnv, storeConfigFor, resolveStore };
