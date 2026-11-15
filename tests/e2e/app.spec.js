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

test("튜토리얼의 설명·그림·버튼이 겹치지 않고 항상 화면 안에 있으며 연습이 동작한다", async ({ page }) => {
  await page.getByRole("button", { name: /튜토리얼/ }).first().click();
  const dialog = page.getByRole("dialog");
  for (let index = 1; index <= 8; index += 1) {
    await dialog.getByRole("button", { name: new RegExp(`^${index}단계`) }).click();
    const layout = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
      const copy = rect(".tut-copy"); const visual = rect(".tut-visual"); const footer = rect(".tut-footer"); const next = rect(".tut-next");
      const stacked = visual.top >= copy.bottom - 1 || visual.left >= copy.right - 1 || copy.left >= visual.right - 1;
      return { stacked, footerInside: footer.bottom <= innerHeight + 1 && footer.top >= 0, nextInside: next.right <= innerWidth + 1 && next.left >= 0 };
    });
    expect(layout.stacked, `${index}단계에서 설명과 그림이 겹치면 안 됩니다.`).toBeTruthy();
    expect(layout.footerInside && layout.nextInside, `${index}단계에서 이전/다음 버튼이 화면 안에 있어야 합니다.`).toBeTruthy();
  }
  // 보석 연습: 서로 다른 3개를 누르면 완료 메시지가 나와요
  await dialog.getByRole("button", { name: /^4단계/ }).click();
  for (const name of ["다이아몬드 보석", "사파이어 보석", "에메랄드 보석"]) await dialog.getByRole("button", { name }).click();
  await expect(dialog).toContainText("서로 다른 보석 3개를 가져갔어요");
  // 귀족 연습: 카드를 4장씩 사면 귀족이 찾아와요
  await dialog.getByRole("button", { name: /^7단계/ }).click();
  for (let count = 0; count < 4; count += 1) {
    await dialog.getByRole("button", { name: "파랑 카드 사기" }).click();
    await dialog.getByRole("button", { name: "초록 카드 사기" }).click();
  }
  await expect(dialog).toContainText("귀족님이 찾아왔어요");
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

test("게임 카드 일러스트가 로드되고 카드를 여백 없이 채운다", async ({ page }) => {
  await page.goto("/?demo=1");
  await page.waitForLoadState("networkidle");
  const cards = page.locator(".market .dev-card img.card-art");
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
  expect(results.every((result) => result.loaded && result.fit === "cover" && result.position === "50% 50%" && result.inside)).toBeTruthy();
});

test("아이패드 가로 화면에서 스크롤 없이 게임판 전체와 플레이어 보유 현황이 보인다", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.goto("/?demo=1");
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  for (const selector of [".supply-section", ".nobles-section", ".market-row:last-child .dev-card:last-child", ".player-panel:last-child .asset-row"]) {
    const box = await page.locator(selector).boundingBox();
    expect(box.y + box.height, `${selector}가 화면 안에 있어야 합니다.`).toBeLessThanOrEqual(701);
    expect(box.x + box.width).toBeLessThanOrEqual(1025);
  }
  await expect(page.locator(".player-panel")).toHaveCount(2);
  await expect(page.locator(".player-panel .asset-card[aria-label*='카드']")).toHaveCount(10);
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

test("튜토리얼 창에도 심각한 접근성 위반이 없다", async ({ page }) => {
  await page.getByRole("button", { name: /튜토리얼/ }).first().click();
  const results = await new AxeBuilder({ page }).include(".tut-dialog").disableRules(["color-contrast"]).analyze();
  expect(results.violations).toEqual([]);
});
