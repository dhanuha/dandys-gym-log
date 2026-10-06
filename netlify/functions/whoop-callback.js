const { exchangeCode, saveTokens, env } = require("./_whoop");
// WHOOP redirects back here with ?code=... — we exchange it for tokens, store them, and bounce back to the app.
exports.handler = async (event) => {
  const { base } = env();
  const params = event.queryStringParameters || {};
  const back = (ok) => ({ statusCode: 302, headers: { Location: `${base}/?whoop=${ok ? "connected" : "error"}` }, body: "" });
  try {
    if (params.error || !params.code) return back(false);
    const cookie = event.headers.cookie || "";
    const m = cookie.match(/whoop_state=([^;]+)/);
    if (!m || !params.state || m[1] !== params.state) return back(false);
    const tokens = await exchangeCode(params.code);
    await saveTokens(tokens);
    return back(true);
  } catch (e) {
    return back(false);
  }
};
