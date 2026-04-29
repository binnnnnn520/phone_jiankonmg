import { expect, test } from "@playwright/test";

test("camera page creates a visible monitoring session", async ({ page }) => {
  const roomResponsePromise = page.waitForResponse((response) => {
    return (
      response.url().endsWith("/rooms") &&
      response.request().method() === "POST"
    );
  });

  await page.goto("/?mode=camera");

  await expect(page.getByRole("heading", { name: "Phone Monitor" })).toBeVisible();

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

  await expect(page.getByText("PIN", { exact: true })).toBeVisible();
  await expect(page.locator("#pin")).toHaveText(/^\d{6}$/);
  await expect(page.getByLabel("Viewer QR code")).toBeVisible();
  await expect(page.locator("#connection-mode")).toHaveText("Remote");
  await expect(page.getByRole("status")).toHaveText(/waiting for a viewer/i);
});

test("viewer page shows PIN-gated connection UI", async ({ page }) => {
  await page.goto("/?mode=viewer");

  await expect(page.getByRole("heading", { name: "Phone Monitor" })).toBeVisible();
  await expect(page.locator("#connection-mode")).toHaveText("Remote");
  await expect(page.getByRole("status")).toHaveText("Connect to a camera");
  await expect(page.getByRole("button", { name: "Scan QR code" })).toBeVisible();
  await expect(page.getByLabel("Room")).toBeVisible();
  await expect(page.getByLabel("PIN")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect", exact: true })
  ).toBeVisible();
});

test("home connection mode selection flows into viewer and camera pages", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Remote" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.getByRole("button", { name: "Same Wi-Fi" }).click();
  await expect(page.getByRole("button", { name: "Same Wi-Fi" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.getByRole("button", { name: "Watch a camera" }).click();
  await expect(page).toHaveURL(/connection=nearby/);
  await expect(page.locator("#connection-mode")).toHaveText("Same Wi-Fi");

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Same Wi-Fi" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.getByRole("button", { name: "Use this phone as camera" }).click();
  await expect(page).toHaveURL(/connection=nearby/);
  await expect(page.locator("#connection-mode")).toHaveText("Same Wi-Fi");
});

test("bottom navigation switches between home tabs", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Home" })).toHaveAttribute(
    "aria-current",
    "page"
  );

  await page.getByRole("button", { name: "Cameras" }).click();
  await expect(page).toHaveURL(/tab=cameras/);
  await expect(page.getByRole("button", { name: "Cameras" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(
    page.getByRole("heading", { name: "Cameras", exact: true })
  ).toBeVisible();

  await page.getByRole("button", { name: "Me", exact: true }).click();
  await expect(page).toHaveURL(/tab=me/);
  await expect(page.getByRole("button", { name: "Me", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(page.getByRole("heading", { name: "Me" })).toBeVisible();
});

test("camera and viewer back buttons return to the home screen", async ({ page }) => {
  await page.goto("/?mode=camera");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Two phones, live view" })
  ).toBeVisible();

  await page.goto("/?mode=viewer");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Two phones, live view" })
  ).toBeVisible();
});

test("bottom navigation keeps a consistent dock position and size", async ({ page }) => {
  const viewports = [
    { width: 320, height: 900 },
    { width: 390, height: 900 },
    { width: 768, height: 1200 }
  ];

  const readNavBox = async (path: string) => {
    await page.goto(path);
    const nav = await page.locator(".bottom-nav").boundingBox();
    expect(nav).not.toBeNull();
    return nav!;
  };

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const boxes = [
      await readNavBox("/"),
      await readNavBox("/?tab=cameras"),
      await readNavBox("/?tab=me")
    ];
    const baselineHeight = Math.round(boxes[0]!.height);
    const baselineTop = Math.round(boxes[0]!.y);

    for (const nav of boxes) {
      expect(Math.round(nav.height)).toBe(baselineHeight);
      expect(Math.round(nav.y)).toBe(baselineTop);
      expect(Math.round(nav.y + nav.height)).toBeLessThanOrEqual(
        viewport.height - 24
      );
    }
  }
});

test("viewer room links prefill the room before PIN entry", async ({ page }) => {
  await page.goto("/?room=room-from-qr");

  await expect(page.getByRole("heading", { name: "Phone Monitor" })).toBeVisible();
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
    const verifyResponse = await verifyResponsePromise;
    expect(verifyResponse.ok()).toBe(true);

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

test("paired camera can reconnect from Cameras tab without entering PIN again", async ({ page }) => {
  const viewer = await page.context().newPage();
  const dashboard = await page.context().newPage();
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
    await viewer.getByLabel("PIN").fill(room.pin);
    await viewer.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(viewer.getByRole("status")).toHaveText(
      /connecting|live|using relay connection/i
    );

    await viewer.close();

    await dashboard.goto("/?tab=cameras");
    await expect(dashboard.getByText("This phone camera")).toBeVisible();
    await expect(dashboard.locator(".pair-status")).toHaveText("Live");
    await dashboard.getByRole("button", { name: "Reconnect", exact: true }).click();
    await expect(dashboard).toHaveURL(/pair=/);
    await expect(dashboard.getByRole("status")).toHaveText(
      /connecting|live|using relay connection/i
    );
    await expect
      .poll(
        async () =>
          dashboard.locator("#remote").evaluate((element) => {
            const video = element as HTMLVideoElement;
            return `${Boolean(video.srcObject)}:${video.readyState}`;
          }),
        { timeout: 15000 }
      )
      .toMatch(/^true:[1-4]$/);
  } finally {
    await dashboard.close().catch(() => undefined);
    await viewer.close().catch(() => undefined);
  }
});

test("stopped paired camera reconnect shows offline feedback", async ({ page }) => {
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
    await viewer.getByLabel("PIN").fill(room.pin);
    await viewer.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(viewer.getByRole("status")).toHaveText(
      /connecting|live|using relay connection/i
    );

    await page.getByRole("button", { name: "Stop" }).click();
    await expect(viewer.getByRole("status")).toHaveText(
      /camera offline|session ended/i
    );

    await viewer.goto("/?tab=cameras");
    await expect(viewer.getByText("This phone camera")).toBeVisible();
    await expect(viewer.locator(".pair-status")).toHaveText("Offline");
    await viewer.getByRole("button", { name: "Reconnect", exact: true }).click();

    await expect(viewer).toHaveURL(/pair=/);
    await expect(viewer.getByRole("status")).toHaveText(
      "Camera is offline. Start monitoring on the camera phone, then try again."
    );
  } finally {
    await viewer.close().catch(() => undefined);
  }
});
