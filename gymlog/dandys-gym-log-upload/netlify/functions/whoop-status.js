const { loadTokens, validAccessToken, json } = require("./_whoop");
exports.handler = async () => {
  const t = await loadTokens();
  if (!t) return json(200, { connected: false });
  const ok = await validAccessToken();
  return json(200, { connected: !!ok });
};
