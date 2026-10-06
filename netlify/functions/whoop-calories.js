const { API, validAccessToken, loadTokens, clearTokens, json } = require("./_whoop");
// Convert an ISO timestamp to the YYYY-MM-DD date in a given IANA timezone.
function localDay(iso, tz) {
  try {
    const dtf = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    return dtf.format(new Date(iso)); // en-CA gives YYYY-MM-DD
  } catch (e) {
    return (iso || "").slice(0, 10);
  }
}
// Returns daily calories burned for a date range. ?start=YYYY-MM-DD&end=YYYY-MM-DD
exports.handler = async (event) => {
  try {
    const t = await loadTokens();
    if (!t) return json(200, { connected: false, days: {} });
    const token = await validAccessToken();
    if (!token) return json(200, { connected: false, days: {} });

    const q = event.queryStringParameters || {};
    const end = q.end ? new Date(new Date(q.end + "T23:59:59Z").getTime() + 864e5) : new Date(Date.now() + 864e5);
    const start = q.start ? new Date(new Date(q.start + "T00:00:00Z").getTime() - 864e5) : new Date(Date.now() - 14 * 864e5);

    // Page through cycles in the window
    const days = {}; // date -> kcal (summed kilojoules / 4.184)
    let next = null, guard = 0;
    do {
      const u = new URL(API + "/cycle");
      u.searchParams.set("start", start.toISOString());
      u.searchParams.set("end", end.toISOString());
      u.searchParams.set("limit", "25");
      if (next) u.searchParams.set("nextToken", next);
      const r = await fetch(u, { headers: { Authorization: "Bearer " + token } });
      if (r.status === 401) { await clearTokens(); return json(200, { connected: false, days: {} }); }
      if (!r.ok) return json(502, { error: "whoop " + r.status });
      const data = await r.json();
      for (const c of data.records || []) {
        const kj = c.score && typeof c.score.kilojoule === "number" ? c.score.kilojoule : null;
        if (kj == null) continue;
        // Assign the cycle to its LOCAL day (Australia/Melbourne), not the UTC date,
        // so burned calories line up with what the WHOOP app shows for the user.
        const startISO = c.start || c.created_at;
        if (!startISO) continue;
        const d = localDay(startISO, "Australia/Melbourne");
        if (!d) continue;
        days[d] = (days[d] || 0) + kj / 4.184;
      }
      next = data.next_token || null;
    } while (next && ++guard < 20);

    const rounded = {};
    for (const [d, v] of Object.entries(days)) rounded[d] = Math.round(v);
    return json(200, { connected: true, days: rounded });
  } catch (e) {
    return json(500, { error: String(e && e.message || e) });
  }
};
