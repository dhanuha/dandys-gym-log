const { clearTokens, json } = require("./_whoop");
exports.handler = async () => { await clearTokens(); return json(200, { connected: false }); };
