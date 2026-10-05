// Shared WHOOP OAuth + storage helpers (Netlify Blobs for tokens)
const AUTH = "https://api.prod.whoop.com/oauth/oauth2/auth";
const TOKEN = "https://api.prod.whoop.com/oauth/oauth2/token";
const API = "https://api.prod.whoop.com/developer/v2";

function env() {
  const id = process.env.WHOOP_CLIENT_ID, secret = process.env.WHOOP_CLIENT_SECRET;
  const base = (process.env.APP_URL || "https://dandey26.netlify.app").replace(/\/$/, "");
  return { id, secret, base, redirect: base + "/.netlify/functions/whoop-callback" };
}

// Netlify Blobs store for the single user's tokens.
// Tries the automatic site context first; falls back to explicit siteID+token
// (set NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN env vars) when the context is missing.
async function store() {
  const { getStore } = await import("@netlify/blobs");
  try {
    return getStore("whoop");
  } catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token  = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) return getStore({ name: "whoop", siteID, token });
    throw e;
  }
}
async function saveTokens(t) {
  const s = await store();
  await s.setJSON("tokens", { ...t, obtained_at: Date.now() });
}
async function loadTokens() {
  const s = await store();
  return (await s.get("tokens", { type: "json" })) || null;
}
async function clearTokens() {
  const s = await store();
  await s.delete("tokens");
}

async function exchangeCode(code) {
  const { id, secret, redirect } = env();
  const body = new URLSearchParams({
    grant_type: "authorization_code", code, redirect_uri: redirect,
    client_id: id, client_secret: secret,
  });
  const r = await fetch(TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) throw new Error("token exchange failed: " + r.status + " " + (await r.text()));
  return r.json();
}
async function refresh(refresh_token) {
  const { id, secret } = env();
  const body = new URLSearchParams({
    grant_type: "refresh_token", refresh_token, client_id: id, client_secret: secret,
    scope: "offline read:cycles",
  });
  const r = await fetch(TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) throw new Error("refresh failed: " + r.status);
  return r.json();
}
async function validAccessToken() {
  let t = await loadTokens();
  if (!t) return null;
  const age = (Date.now() - (t.obtained_at || 0)) / 1000;
  if (age > (t.expires_in || 3600) - 120) {
    if (!t.refresh_token) return null;
    const nt = await refresh(t.refresh_token);
    t = { ...t, ...nt }; await saveTokens(t);
  }
  return t.access_token;
}

const json = (code, obj) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(obj),
});

module.exports = { AUTH, TOKEN, API, env, saveTokens, loadTokens, clearTokens, exchangeCode, validAccessToken, json };
