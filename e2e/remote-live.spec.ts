import { expect, test } from "@playwright/test";

test("camera page creates a visible monitoring session", async ({ page }) => {
  const roomResponsePromise = page.waitForResponse((response) => {
    return (
      response.url().endsWith("/rooms") &&
      response.request().method() === "POST"
    );
  });

  await page.goto("/?mode=camera");

  await expect(
    page.getByRole("heading", { name: "Active Monitoring" })
  ).toBeVisible();

  const roomResponse = await roomResponsePromise;
  const room = (await roomResponse.json()) as {
    pin?: unknown;
    roomId?: unknown;
    qrPayload?: unknown;
  };
  expect(room.pin).toEqual(expect.stringMatching(/^\d{6}$/));
  expect(room.roomId).toEqual(expect.any(String));
  expect(room.qrPayload).toEqual(expect.stringContaining(String(room.roomId)));

  await expect(page.getByText("Viewer PIN")).toBeVisible();
  await expect(page.locator("#pin")).toHaveText(/^\d{6}$/);
  await expect(page.getByLabel("Viewer QR code")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(/waiting for a viewer/i);
});

test("viewer page shows PIN-gated connection UI", async ({ page }) => {
  await page.goto("/?mode=viewer");

  await expect(page.getByRole("heading", { name: "Live Monitor" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(
    "Enter the room and PIN from the camera phone."
  );
  await expect(page.getByLabel("Room")).toBeVisible();
  await expect(page.getByLabel("PIN")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect", exact: true })
  ).toBeVisible();
});

test("viewer room links prefill the room before PIN entry", async ({ page }) => {
  await page.goto("/?room=room-from-qr");

  await expect(page.getByRole("heading", { name: "Live Monitor" })).toBeVisible();
  await expect(page.getByLabel("Room")).toHaveValue("room-from-qr");
  await expect(page.getByLabel("PIN")).toBeVisible();
});
