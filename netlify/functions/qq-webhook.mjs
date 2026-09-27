import crypto from "node:crypto";
import cardDatabase from "../../data/Z_BP01.json" with { type: "json" };

// Importing the JSON lets Netlify bundle it with this function instead of
// relying on a filesystem path that does not exist in the serverless runtime.
const cards = cardDatabase.data.list;

const QQ_API = "https://api.sgroup.qq.com";
const ACCESS_TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";
let tokenCache = { value: "", expiresAt: 0 };

function json(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function normalize(value) {
  return String(value ?? "").trim().toLocaleLowerCase("zh-CN");
}

function search(keyword) {
  const key = normalize(keyword);
  return cards.filter((card) =>
    normalize(card.name).includes(key) || normalize(card.serial_number).includes(key)
  );
}

function exactMatch(keyword, matches) {
  const key = normalize(keyword);
  return matches.filter((card) => normalize(card.name) === key || normalize(card.serial_number) === key);
}

function secretSeed(secret) {
  if (!secret) throw new Error("QQ_CLIENT_SECRET is missing");
  let seed = Buffer.from(secret, "utf8");
  while (seed.length < 32) seed = Buffer.concat([seed, seed]);
  return seed.subarray(0, 32);
}

function qqSigningKeys(secret) {
  // PKCS#8 prefix for an Ed25519 private key whose final 32 bytes are the seed.
  const privateDer = Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    secretSeed(secret),
  ]);
  const privateKey = crypto.createPrivateKey({ key: privateDer, format: "der", type: "pkcs8" });
  return { privateKey, publicKey: crypto.createPublicKey(privateKey) };
}

function verifyQqSignature(headers, rawBody) {
  const signature = headers["x-signature-ed25519"];
  const timestamp = headers["x-signature-timestamp"];
  const secret = process.env.QQ_CLIENT_SECRET;
  if (!signature || !timestamp || !secret) return false;
  const { publicKey } = qqSigningKeys(secret);
  return crypto.verify(
    null,
    Buffer.from(timestamp + rawBody, "utf8"),
    publicKey,
    Buffer.from(signature, "hex"),
  );
}

function callbackValidation(data) {
  const plainToken = data?.d?.plain_token;
  const eventTs = data?.d?.event_ts;
  const secret = process.env.QQ_CLIENT_SECRET;
  if (!plainToken || !eventTs || !secret) return null;
  // QQ derives an Ed25519 key from AppSecret and signs event_ts + plain_token.
  const { privateKey } = qqSigningKeys(secret);
  const signature = crypto
    .sign(null, Buffer.from(eventTs + plainToken, "utf8"), privateKey)
    .toString("hex");
  return { plain_token: plainToken, signature };
}

async function getAccessToken() {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt) return tokenCache.value;
  const response = await fetch(ACCESS_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appId: process.env.QQ_APP_ID, clientSecret: process.env.QQ_CLIENT_SECRET }),
  });
  if (!response.ok) throw new Error(`获取 QQ Access Token 失败：${response.status}`);
  const result = await response.json();
  tokenCache = { value: result.access_token, expiresAt: Date.now() + (result.expires_in - 120) * 1000 };
  return tokenCache.value;
}

async function qqRequest(url, method, body) {
  const token = await getAccessToken();
  const response = await fetch(`${QQ_API}${url}`, {
    method,
    headers: {
      Authorization: `QQBot ${token}`,
      "X-Union-Appid": process.env.QQ_APP_ID,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`QQ API 请求失败：${response.status} ${await response.text()}`);
  return response.json();
}

async function sendText(groupOpenid, content, msgId) {
  return qqRequest(`/v2/groups/${encodeURIComponent(groupOpenid)}/messages`, "POST", {
    content,
    msg_type: 0,
    msg_id: msgId,
  });
}

async function sendImage(groupOpenid, imageUrl, msgId) {
  const uploaded = await qqRequest(`/v2/groups/${encodeURIComponent(groupOpenid)}/files`, "POST", {
    file_type: 1,
    url: imageUrl,
  });
  return qqRequest(`/v2/groups/${encodeURIComponent(groupOpenid)}/messages`, "POST", {
    msg_type: 7,
    msg_id: msgId,
    media: { file_info: uploaded.file_info },
  });
}

function listMessage(matches) {
  const names = matches
    .slice(0, 10)
    .map((card) => `${card.serial_number} ${card.name}`);
  const suffix = matches.length > 10 ? "\n……（结果过多，请输入更完整的卡名）" : "";
  return `查询到以下 ${matches.length} 张卡牌：\n${names.join("\n")}${suffix}\n\n输入完整卡号查看卡图。`;
}

export default async (request) => {
  if (request.method !== "POST") return json(405, { error: "Method Not Allowed" });
  const rawBody = await request.text();
  let data;
  try { data = JSON.parse(rawBody); } catch { return json(400, { error: "Invalid JSON" }); }

  const headers = Object.fromEntries(request.headers.entries());
  if (!verifyQqSignature(headers, rawBody)) return json(401, { error: "Invalid QQ signature" });

  // QQ callback URL verification (OP 13) is intentionally handled before normal events.
  if (Number(data.op) === 13) {
    const verification = callbackValidation(data);
    if (!verification) return json(400, { error: "Invalid verification payload" });

    // QQ requires this exact JSON object for the callback URL challenge.
    return new Response(JSON.stringify({
      plain_token: verification.plain_token,
      signature: verification.signature,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Always ACK immediately; message delivery happens through QQ's REST API.
  if (data.op !== 0 || data.t !== "GROUP_AT_MESSAGE_CREATE") return json(200, { op: 12, d: 0 });
  const event = data.d;
  // Some deliveries include the bot mention in content; strip it when present.
  const keyword = String(event.content ?? "").replace(/^\s*<@!?[^>]+>\s*/, "").trim();
  if (!keyword) {
    await sendText(event.group_openid, "我是正面卡查。@我后直接输入卡名即可，例如：@正面卡查 关银屏", event.id);
    return json(200, { op: 12, d: 0 });
  }

  const matches = search(keyword);
  if (matches.length === 0) {
    await sendText(event.group_openid, `未找到“${keyword}”相关卡牌。`, event.id);
  } else {
    const exact = exactMatch(keyword, matches);
    if (exact.length === 1) {
      await sendImage(event.group_openid, exact[0].img_hd_url, event.id);
    } else if (matches.length === 1) {
      await sendImage(event.group_openid, matches[0].img_hd_url, event.id);
    } else {
      await sendText(event.group_openid, listMessage(matches), event.id);
    }
  }
  return json(200, { op: 12, d: 0 });
};
