"use strict";

const crypto = require("node:crypto");

const COOKIE_NAME = "agenda_session";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function sign(data, secret) {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

function signSession(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return body + "." + sign(body, secret);
}

function verifySession(token, secret, nowMs) {
  if (typeof token !== "string" || typeof secret !== "string" || !secret) return null;
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(body, secret));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch (e) {
    return null;
  }
  if (!payload || typeof payload.exp !== "number" || payload.exp <= nowMs) return null;
  return payload;
}

function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach(function (part) {
    const idx = part.indexOf("=");
    if (idx < 0) return;
    const name = part.slice(0, idx).trim();
    const raw = part.slice(idx + 1).trim();
    try { out[name] = decodeURIComponent(raw); } catch (e) { out[name] = raw; }
  });
  return out;
}

function attrs(maxAge, opts) {
  const parts = ["HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=" + maxAge];
  if (!opts || opts.secure !== false) parts.push("Secure");
  return parts.join("; ");
}

function buildCookie(token, opts) {
  return COOKIE_NAME + "=" + token + "; " + attrs(MAX_AGE_SECONDS, opts);
}

function clearCookie(opts) {
  return COOKIE_NAME + "=; " + attrs(0, opts);
}

module.exports = { COOKIE_NAME, MAX_AGE_SECONDS, signSession, verifySession, parseCookies, buildCookie, clearCookie };
