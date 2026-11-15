import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  page.browserErrors = browserErrors;
});

test.afterEach(async ({ page }) => {
  expect(page.browserErrors, "브라우저 콘솔 오류가 없어야 합니다.").toEqual([]);
});

test("튜토리얼이 2·3·4인 준비와 8단계를 정확히 안내한다", async ({ page }) => {
  await page.getByRole("button", { name: /튜토리얼/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: /단계/ })).toHaveCount(8);

  await dialog.getByRole("button", { name: "2단계 준비" }).click();
  await dialog.getByRole("button", { name: "4인" }).click();
  await expect(dialog).toContainText("색깔 보석 7개, 귀족 5명");
  await dialog.getByRole("button", { name: "3인" }).click();
  await expect(dialog).toContainText("색깔 보석 5개, 귀족 4명");
  await dialog.getByRole("button", { name: "2인" }).click();
  await expect(dialog).toContainText("색깔 보석 4개, 귀족 3명");

  for (let index = 3; index <= 8; index += 1) {
    await dialog.getByRole("button", { name: `${index}단계`, exact: false }).click();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), `${index}단계가 튜토리얼 폭을 넘지 않아야 합니다.`).toBeTruthy();
  }
  await expect(dialog).toContainText("30초 안에 행동 하나");
});

test("튜토리얼과 랜딩이 현재 화면 폭을 넘지 않는다", async ({ page }) => {
  const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBeTruthy();
  await noOverflow();
  await page.getByRole("button", { name: /튜토리얼/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await noOverflow();
  const box = await page.getByRole("dialog").boundingBox();
  const viewport = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.width).toBeLessThanOrEqual(viewport.width + 1);
});

test("게임 카드 일러스트가 로드되고 중앙에 잘림 없이 표시된다", async ({ page }) => {
  await page.goto("/?demo=1");
  await page.waitForLoadState("networkidle");
  const cards = page.locator(".market .dev-card .card-art img");
  await expect(cards).toHaveCount(12);
  const results = await cards.evaluateAll((images) => images.map((image) => {
    const style = getComputedStyle(image);
    const parent = image.parentElement.getBoundingClientRect();
    const rect = image.getBoundingClientRect();
    return {
      loaded: image.complete && image.naturalWidth > 0,
      fit: style.objectFit,
      position: style.objectPosition,
      inside: rect.left >= parent.left - 1 && rect.right <= parent.right + 1 && rect.top >= parent.top - 1 && rect.bottom <= parent.bottom + 1,
    };
  }));
  expect(results.every((result) => result.loaded && result.fit === "contain" && result.position === "50% 50%" && result.inside)).toBeTruthy();
});

test("90장 카드 파일이 브라우저에서도 전부 로드된다", async ({ page }) => {
  const paths = Array.from({ length: 90 }, (_, index) => `/assets/cards/generated/card-${String(index).padStart(3, "0")}.jpg`);
  const results = await page.evaluate(async (sources) => Promise.all(sources.map((source) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ source, ok: true, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ source, ok: false });
    image.src = source;
  }))), paths);
  expect(results.filter((result) => !result.ok)).toEqual([]);
  expect(results.every((result) => result.width >= 500 && result.height >= 500)).toBeTruthy();
});

test("핵심 화면에 심각한 접근성 위반이 없다", async ({ page }) => {
  const results = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
  expect(results.violations).toEqual([]);
});
