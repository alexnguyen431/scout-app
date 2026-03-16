import { Redis } from "@upstash/redis";

let redis;
function getRedis() {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set");
    redis = new Redis({ url, token });
  }
  return redis;
}

const SCOUT_KEY_REGEX = /^scout_[a-z0-9]{8}$/i;
function isValidScoutKey(key) {
  return typeof key === "string" && SCOUT_KEY_REGEX.test(key.trim());
}
function normalizeKey(key) {
  if (typeof key !== "string") return null;
  const k = key.trim();
  return isValidScoutKey(k) ? k.toLowerCase() : null;
}
function getScoutKey(req) {
  const headers = req.headers || {};
  const get = (name) => (typeof headers.get === "function" ? headers.get(name) : headers[name] || headers[name.toLowerCase()]);
  const keyHeader = get("x-scout-key") || get("X-Scout-Key");
  if (keyHeader) {
    const k = normalizeKey(keyHeader);
    if (k) return k;
  }
  const auth = get("authorization") || get("Authorization");
  if (auth && auth.startsWith("Bearer ")) {
    const k = normalizeKey(auth.slice(7));
    if (k) return k;
  }
  return null;
}

function send(res, status, data) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.status(status).json(data);
}

async function parseBody(req) {
  const b = req.body;
  if (b !== undefined && b !== null) {
    if (typeof b === "object" && !Buffer.isBuffer(b)) return b;
    if (typeof b === "string") {
      try { return JSON.parse(b); } catch { return {}; }
    }
    return {};
  }
  if (typeof req.json === "function") {
    try { return await req.json(); } catch { return {}; }
  }
  return new Promise((resolve) => {
    let buf = "";
    req.on("data", (ch) => { buf += typeof ch === "string" ? ch : (ch?.toString?.() ?? ""); });
    req.on("end", () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

async function getWorkspace(key) {
  const data = await getRedis().get(`ws:${key}`);
  return data || null;
}
async function setWorkspace(key, ws) {
  await getRedis().set(`ws:${key}`, JSON.stringify(ws));
}
async function getOrCreateWorkspace(key) {
  let ws = await getWorkspace(key);
  if (!ws) {
    ws = { key, email: null, created_at: new Date().toISOString() };
    await setWorkspace(key, ws);
  }
  if (typeof ws === "string") ws = JSON.parse(ws);
  return ws;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Scout-Key");
    return res.status(204).end();
  }

  const key = getScoutKey(req);
  if (!key) return send(res, 401, { error: "Scout key required" });

  if (req.method === "POST") {
    const body = await parseBody(req);
    const email = body?.email && typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
    if (!email) return send(res, 400, { error: "Email required" });
    let ws = await getOrCreateWorkspace(key);
    if (ws.email && ws.email !== email) await getRedis().del(`ws-email:${ws.email}`);
    ws.email = email;
    await setWorkspace(key, ws);
    await getRedis().set(`ws-email:${email}`, key);
    return send(res, 200, { ok: true });
  }

  if (req.method === "DELETE") {
    let ws = await getWorkspace(key);
    if (ws) {
      if (typeof ws === "string") ws = JSON.parse(ws);
      if (ws.email) await getRedis().del(`ws-email:${ws.email}`);
      ws.email = null;
      await setWorkspace(key, ws);
    }
    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: "Method not allowed" });
}

