const { AUTH, env } = require("./_whoop");
// Starts the WHOOP OAuth flow: redirects the user to WHOOP's consent screen.
exports.handler = async () => {
  const { id, redirect } = env();
  if (!id) return { statusCode: 500, body: "WHOOP_CLIENT_ID not set" };
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const u = new URL(AUTH);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", id);
  u.searchParams.set("redirect_uri", redirect);
  u.searchParams.set("scope", "offline read:cycles");
  u.searchParams.set("state", state);
  return {
    statusCode: 302,
    headers: {
      Location: u.toString(),
      "Set-Cookie": `whoop_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
    body: "",
  };
};
