"use strict";

const crypto = require("node:crypto");

const KEY_LENGTH = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, KEY_LENGTH).toString("hex");
  return { salt: salt, hash: hash };
}

function verifyPassword(password, record) {
  if (!record || typeof record.salt !== "string" || typeof record.hash !== "string") return false;
  if (typeof password !== "string" || password === "") return false;
  const expected = Buffer.from(record.hash, "hex");
  if (expected.length === 0) return false;
  const actual = crypto.scryptSync(password, record.salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

module.exports = { hashPassword, verifyPassword };
