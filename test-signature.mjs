import assert from "node:assert/strict";
import crypto from "node:crypto";

function seed(secret) {
  let value = Buffer.from(secret, "utf8");
  while (value.length < 32) value = Buffer.concat([value, value]);
  return value.subarray(0, 32);
}

function keys(secret) {
  const der = Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    seed(secret),
  ]);
  const privateKey = crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  return { privateKey, publicKey: crypto.createPublicKey(privateKey) };
}

const secret = "12345678901234567890123456789012";
const eventTs = "1790478208";
const plainToken = "12345678901234567890";
const { privateKey, publicKey } = keys(secret);
const signature = crypto.sign(null, Buffer.from(eventTs + plainToken), privateKey);

assert.equal(signature.length, 64);
assert.equal(crypto.verify(null, Buffer.from(eventTs + plainToken), publicKey, signature), true);
assert.equal(crypto.verify(null, Buffer.from(plainToken + eventTs), publicKey, signature), false);
console.log("PASS: QQ Ed25519 callback signing uses event_ts + plain_token");
