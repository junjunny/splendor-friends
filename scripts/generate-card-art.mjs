// 저장소에 있는 먼작귀 팬아트(배경 3종·누끼 캐릭터 8종·장면 11종)를 레이어로 합성해
// 서로 다른 구도의 카드 일러스트 90장을 만들어요. 크롬(Playwright)으로 그려서 JPEG로 저장합니다.
//   1단계: 배경만 (보너스 색 분위기 + 보석 장식)
//   2단계: 캐릭터 한 명을 배경 위에 배치
//   3단계: 장면 일러스트 또는 캐릭터 여럿이 모인 구도
// 사용법: node scripts/generate-card-art.mjs [카드번호 ...]
import { rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { createDeck } from "../src/game.js";

const cardsDirectory = fileURLToPath(new URL("../public/assets/cards/", import.meta.url));
const selected = new Set(process.argv.slice(2).map(Number).filter(Number.isInteger));
const WIDTH = 640;
const HEIGHT = 720;

const BACKGROUNDS = ["bg-meadow", "bg-cave", "bg-ramen"];
const CUTOUTS = ["chiikawa", "hachiware", "usagi", "momonga", "kurimanju", "rakko", "shisa-furuhonya", "ode"];
const SCENES = ["ode-market", "pajama-party", "master-armor", "seiren", "ode-picnic", "pochette-armor", "old-lady", "ramen-armor", "ode-night", "labor-armor", "kani"];
const GROUPS = [
  ["chiikawa", "hachiware", "usagi"], ["kurimanju", "rakko"], ["usagi", "momonga"], ["shisa-furuhonya", "chiikawa"],
  ["ode", "hachiware"], ["momonga", "kurimanju", "shisa-furuhonya"], ["rakko", "chiikawa"], ["ode", "usagi", "momonga"], ["hachiware", "chiikawa"],
];

// 보너스 색마다 시간대·분위기를 다르게 줘서 그림만 봐도 색을 짐작할 수 있어요.
const MOODS = {
  white: { filter: "brightness(1.06) saturate(.82)", tint: "#ffffff", blend: "screen", opacity: 0.16, gem: ["#ffffff", "#f1ebe0", "#a89b88"], glow: "#ffffff" },
  blue: { filter: "saturate(.9)", tint: "#2d74e0", blend: "color", opacity: 0.56, gem: ["#bfe0ff", "#2f80ed", "#1b4fa8"], glow: "#cfe6ff" },
  green: { filter: "saturate(1.1)", tint: "#1f9a52", blend: "color", opacity: 0.5, gem: ["#c9f5d6", "#27ae60", "#14703b"], glow: "#dcffe6" },
  red: { filter: "saturate(1.15)", tint: "#ff4a4a", blend: "color", opacity: 0.52, gem: ["#ffd0d6", "#eb3b5a", "#a31735"], glow: "#ffe1d6" },
  black: { filter: "brightness(.74) saturate(.85)", tint: "#2a1f55", blend: "multiply", opacity: 0.44, gem: ["#a99bc4", "#3d3350", "#17121f"], glow: "#cbb9ff" },
};
const GEM_SHAPES = {
  white: "polygon(50% 0,96% 42%,70% 100%,30% 100%,4% 42%)",
  blue: "polygon(24% 4%,76% 4%,100% 50%,76% 96%,24% 96%,0 50%)",
  green: "polygon(28% 0,72% 0,100% 28%,100% 72%,72% 100%,28% 100%,0 72%,0 28%)",
  red: "polygon(18% 8%,82% 8%,100% 38%,50% 100%,0 38%)",
  black: "inset(4% round 22%)",
};

// 배경을 보는 8가지 시점: [확대, 가로 이동%, 세로 이동%, 좌우 반전]
const VIEWS = [[1, 0, 0, 0], [1.5, -12, -8, 0], [1.5, 12, 8, 1], [1.9, 0, 14, 0], [1.25, 8, -6, 1], [1.7, -14, 10, 0], [2.1, 10, -4, 0], [1.35, -6, 6, 1]];
// 캐릭터 한 명의 4가지 포즈: [가로 중심%, 바닥%, 높이%, 기울기deg, 배경 확대]
const POSES = [[57, 4, 64, 0, 1.2], [60, -16, 92, 4, 1.7], [58, 9, 46, -2, 1], [44, -12, 78, -7, 1.45]];

function seeded(seed) {
  let value = seed * 2654435761 >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const background = (name, [zoom, x, y, flip], mood, extraFilter = "") =>
  `<img class="bg" src="${name}.png" style="transform:scale(${zoom}) translate(${x}%,${y}%) scaleX(${flip ? -1 : 1});filter:${mood.filter} ${extraFilter}">`
  + `<div class="tint" style="background:${mood.tint};mix-blend-mode:${mood.blend};opacity:${mood.opacity}"></div>`;

const cutout = (name, centerX, bottom, height, tilt, flip, z = 2) => {
  const width = height * (HEIGHT / WIDTH) * 1.25;
  return `<div class="shadow" style="left:${centerX - width * 0.3}%;bottom:${Math.max(bottom - 1.5, 0)}%;width:${width * 0.6}%;z-index:${z}"></div>`
    + `<img class="cutout" src="${name}.png" style="left:${centerX - width / 2}%;bottom:${bottom}%;width:${width}%;height:${height}%;transform:rotate(${tilt}deg) scaleX(${flip ? -1 : 1});z-index:${z}">`;
};

// 보석과 반짝이는 가장자리에만 흩뿌려서 캐릭터 얼굴과 카드의 점수·비용 표시를 가리지 않게 해요.
function decorations(random, bonus, gemCount, sparkleCount, keepCenterClear) {
  const mood = MOODS[bonus];
  const spot = () => {
    for (;;) {
      const x = 4 + random() * 88;
      const y = 20 + random() * 72;
      if (!keepCenterClear || x < 22 || x > 82 || y < 30) return [x, y];
    }
  };
  let html = "";
  for (let index = 0; index < gemCount; index += 1) {
    const [x, y] = spot();
    const size = 46 + random() * 40;
    html += `<div class="gem-wrap" style="left:${x}%;top:${y}%;width:${size}px;height:${size}px;transform:translate(-50%,-50%) rotate(${random() * 50 - 25}deg);filter:drop-shadow(0 0 7px ${mood.glow}) drop-shadow(0 0 1.5px rgba(40,25,35,.9)) drop-shadow(0 4px 3px rgba(40,25,35,.35))">`
      + `<div class="gem" style="clip-path:${GEM_SHAPES[bonus]};background:radial-gradient(circle at 32% 26%,rgba(255,255,255,.95) 0 8%,transparent 9%),linear-gradient(135deg,${mood.gem[0]},${mood.gem[1]} 48%,${mood.gem[2]})"></div></div>`;
  }
  for (let index = 0; index < sparkleCount; index += 1) {
    const [x, y] = spot();
    html += `<span class="sparkle" style="left:${x}%;top:${y}%;font-size:${14 + random() * 26}px;opacity:${0.55 + random() * 0.45};text-shadow:0 0 8px ${mood.glow},0 0 2px #fff">✦</span>`;
  }
  return html;
}

const glow = (mood, x, y, size) => `<div class="glow" style="left:${x}%;top:${y}%;width:${size}%;background:radial-gradient(circle,${mood.glow} 0,rgba(255,255,255,.55) 30%,transparent 68%)"></div>`;
const vignette = (mood, strength) => `<div class="vignette" style="box-shadow:inset 0 0 ${strength}px ${Math.round(strength / 3)}px ${mood.gem[1]}"></div>`;

function compose(card, index, order) {
  const random = seeded(index + 1);
  const mood = MOODS[card.bonus];
  const night = card.bonus === "black";
  if (card.tier === 1) {
    return background(BACKGROUNDS[order % 3], VIEWS[order % VIEWS.length], mood)
      + decorations(random, card.bonus, 3 + (order % 3), night ? 12 : 5, false)
      + vignette(mood, 90);
  }
  if (card.tier === 2) {
    const [centerX, bottom, height, tilt, zoom] = POSES[Math.floor(order / CUTOUTS.length) % POSES.length];
    const name = CUTOUTS[order % CUTOUTS.length];
    const flip = order % 2;
    return background(BACKGROUNDS[(order + Math.floor(order / CUTOUTS.length)) % 3], [zoom, flip ? 6 : -6, zoom > 1.3 ? 10 : 2, flip], mood, "blur(1.2px)")
      + glow(mood, centerX, 100 - bottom - height / 2, 95)
      + cutout(name, centerX, bottom, height, tilt, flip)
      + decorations(random, card.bonus, 3, night ? 9 : 4, true)
      + vignette(mood, 110);
  }
  // 3단계: 장면 일러스트와 캐릭터 모임을 번갈아 배치해요.
  if (order % 2 === 0 && order / 2 < SCENES.length || order >= GROUPS.length * 2) {
    const scene = SCENES[order >= GROUPS.length * 2 ? order - GROUPS.length : order / 2];
    return `<img class="bg" src="${scene}.png" style="transform:scale(1.04)">`
      + `<div class="tint" style="background:${mood.tint};mix-blend-mode:soft-light;opacity:.22"></div>`
      + decorations(random, card.bonus, 5, night ? 10 : 7, true)
      + vignette(mood, 150);
  }
  const group = GROUPS[(order - 1) / 2];
  const layout = group.length === 3 ? [[25, 6, 50, -5, 2], [75, 6, 50, 5, 2], [50, 0, 58, 0, 3]] : [[33, 2, 58, -4, 2], [69, 1, 60, 4, 3]];
  const members = group.length === 3 ? [group[1], group[2], group[0]] : group;
  return background(BACKGROUNDS[order % 3], [1.3, 0, 8, order % 4 === 1], mood, "blur(1.6px)")
    + glow(mood, 50, 62, 135)
    + members.map((name, slot) => { const [x, bottom, height, tilt, z] = layout[slot]; return cutout(name, x, bottom, height, tilt, slot === 0 && group.length === 2, z); }).join("")
    + decorations(random, card.bonus, 6, night ? 12 : 8, true)
    + vignette(mood, 150);
}

const page = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;background:#fff}
  #stage{position:relative;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:#f6efe6}
  #stage>*{position:absolute}
  .bg{inset:0;width:100%;height:100%;object-fit:cover}
  .tint,.vignette{inset:0}
  .vignette{z-index:6;opacity:.75}
  .glow{aspect-ratio:1;transform:translate(-50%,-50%);opacity:.8;z-index:1}
  .cutout{object-fit:contain;object-position:50% 100%;transform-origin:50% 100%;filter:drop-shadow(0 0 5px rgba(255,255,255,.95)) drop-shadow(0 6px 5px rgba(60,40,50,.28))}
  .shadow{height:5%;border-radius:50%;background:radial-gradient(closest-side,rgba(50,35,45,.4),transparent)}
  .gem-wrap{z-index:5}.gem{width:100%;height:100%}
  .sparkle{z-index:5;color:#fff;transform:translate(-50%,-50%);line-height:1}
</style><div id="stage"></div>`;

const composerPath = `${cardsDirectory}__composer.html`;
await writeFile(composerPath, page);
const browser = await chromium.launch({ channel: "chrome" });
try {
  const tab = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  await tab.goto(pathToFileURL(composerPath).href);
  const cards = [1, 2, 3].flatMap((tier) => createDeck(tier)).sort((a, b) => a.artVariant - b.artVariant);
  const perTier = { 1: 0, 2: 0, 3: 0 };
  for (const card of cards) {
    const order = perTier[card.tier]++;
    const index = card.artVariant;
    if (selected.size && !selected.has(index)) continue;
    await tab.evaluate((html) => { document.getElementById("stage").innerHTML = html; }, compose(card, index, order));
    await tab.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
    await tab.locator("#stage").screenshot({ path: `${cardsDirectory}generated/card-${String(index).padStart(3, "0")}.jpg`, type: "jpeg", quality: 84 });
  }
} finally {
  await browser.close();
  await rm(composerPath, { force: true });
}

console.log(selected.size ? `regenerated ${selected.size} selected card illustrations` : "generated 90 composed card illustrations");
