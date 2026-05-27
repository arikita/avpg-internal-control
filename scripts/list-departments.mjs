// scripts/list-departments.mjs
// Liệt kê distinct department từ Microsoft Graph bằng app-only token.
// Chạy trong container app (đã có env CLIENT_ID/CLIENT_SECRET/TENANT_ID).
const { TENANT_ID, CLIENT_ID, CLIENT_SECRET } = process.env;
if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
  console.error("Thiếu TENANT_ID/CLIENT_ID/CLIENT_SECRET trong env");
  process.exit(1);
}
async function getToken() {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });
  const r = await fetch(
    "https://login.microsoftonline.com/" + TENANT_ID + "/oauth2/v2.0/token",
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }
  );
  if (!r.ok) throw new Error("Token failed: " + (await r.text()));
  return (await r.json()).access_token;
}
(async () => {
  const token = await getToken();
  const counts = new Map();
  let url = "https://graph.microsoft.com/v1.0/users?$select=department&$top=999";
  let total = 0, noDept = 0;
  while (url) {
    const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) {
      console.error("Graph /users " + r.status + ": " + (await r.text()).slice(0, 400));
      process.exit(1);
    }
    const j = await r.json();
    for (const u of j.value) {
      total++;
      const d = (u.department || "").trim();
      if (!d) { noDept++; continue; }
      counts.set(d, (counts.get(d) || 0) + 1);
    }
    url = j["@odata.nextLink"] || null;
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  console.log("\n=== ad_name (department) | so_user ===");
  for (const [d, n] of sorted) console.log(n + "\t" + d);
  console.log("\nTong user: " + total + " | khong co department: " + noDept + " | so department: " + sorted.length);
})().catch((e) => { console.error(e); process.exit(1); });
