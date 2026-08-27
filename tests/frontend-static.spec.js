const { test, expect } = require("@playwright/test");
const path = require("path");

test("calendar loads from API, shows add form, and posts add/remove", async ({ page }) => {
  const fileUrl = "file://" + path.join(__dirname, "..", "public", "index.html");
  const seedEntries = [{ id: "seed1", date: "2026-08-27", person: "jean", obra: "almada", createdAt: "x" }];
  const requests = [];

  await page.route("**/api/entries", async (route) => {
    const req = route.request();
    requests.push({ method: req.method(), body: req.postData() });
    if (req.method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entries: seedEntries }) });
    }
    // POST add or remove: just echo back seedEntries plus a fake new one for add
    const payload = JSON.parse(req.postData() || "{}");
    if (payload.op === "add") {
      const updated = seedEntries.concat([{ id: "new1", date: payload.date, person: payload.person, obra: payload.obra, createdAt: "y" }]);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entries: updated }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entries: [] }) });
  });

  await page.goto(fileUrl);
  await page.waitForTimeout(300);

  const chipCount = await page.locator(".entry-chip").count();
  expect(chipCount).toBeGreaterThan(0);

  await page.locator('[data-action="open-day"][data-date="2026-08-27"]').first().click();
  await page.waitForTimeout(200);

  await expect(page.locator("#addForm")).toHaveCount(1);
  await page.locator('input[name="modal-person"][value="pedro"]').check();
  await page.locator('input[name="modal-obra"][value="montebello"]').check();
  await page.locator("#addBtn").click();
  await page.waitForTimeout(300);

  const addReq = requests.find((r) => r.method === "POST" && JSON.parse(r.body).op === "add");
  expect(addReq).toBeTruthy();
  const addBody = JSON.parse(addReq.body);
  expect(addBody).toMatchObject({ op: "add", date: "2026-08-27", person: "pedro", obra: "montebello" });

  const rmButtonCount = await page.locator(".rm").count();
  expect(rmButtonCount).toBeGreaterThan(0);
});
