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
    cameraToken?: unknown;
    qrPayload?: unknown;
  };
  expect(room.pin).toEqual(expect.stringMatching(/^\d{6}$/));
  expect(room.roomId).toEqual(expect.any(String));
  expect(room.cameraToken).toEqual(expect.any(String));
  expect(room.qrPayload).toEqual(expect.stringContaining(String(room.roomId)));
  expect(room.qrPayload).not.toContain(String(room.cameraToken));

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

test("camera and viewer pair over local signaling", async ({ page }) => {
  const viewer = await page.context().newPage();
  const roomResponsePromise = page.waitForResponse((response) => {
    return (
      response.url().endsWith("/rooms") &&
      response.request().method() === "POST"
    );
  });

  try {
    await page.goto("/?mode=camera");
    const roomResponse = await roomResponsePromise;
    const room = (await roomResponse.json()) as {
      pin: string;
      roomId: string;
    };

    await expect(page.getByRole("status")).toHaveText(/waiting for a viewer/i);

    await viewer.goto(`/?room=${encodeURIComponent(room.roomId)}`);
    await expect(viewer.getByLabel("Room")).toHaveValue(room.roomId);
    await viewer.getByLabel("PIN").fill(room.pin);

    const verifyResponsePromise = viewer.waitForResponse((response) => {
      return (
        response.url().endsWith("/rooms/verify-pin") &&
        response.request().method() === "POST"
      );
    });
    await viewer.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(await verifyResponsePromise).toBeOK();

    await expect(viewer.getByRole("status")).toHaveText(
      /connecting|live|using relay connection/i
    );
    await expect
      .poll(
        async () =>
          viewer.locator("#remote").evaluate((element) => {
            const video = element as HTMLVideoElement;
            return `${Boolean(video.srcObject)}:${video.readyState}`;
          }),
        { timeout: 15000 }
      )
      .toMatch(/^true:[1-4]$/);
  } finally {
    await viewer.close();
  }
});
