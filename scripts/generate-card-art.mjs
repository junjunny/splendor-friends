import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const outputDirectory = fileURLToPath(new URL("../public/assets/cards/generated/", import.meta.url));
const stagingDirectory = await mkdtemp(join(tmpdir(), "splendor-card-art-"));
const selectedIndexes = new Set(process.argv.slice(2).map(Number).filter(Number.isInteger));

await mkdir(outputDirectory, { recursive: true });

// All sources are from the Chiikawa (먼작귀) fan-art set created for this project.
// Tier 1 stays scenery-first; tiers 2 and 3 feature the cast.
const backgrounds = ["bg-meadow", "bg-cave", "bg-ramen"];
const characters = [
  "chiikawa", "hachiware", "usagi", "momonga", "ode", "ode-market", "ode-picnic", "ode-night",
  "kurimanju", "rakko", "shisa-furuhonya", "kani", "pochette-armor", "ramen-armor", "labor-armor",
  "master-armor", "pajama-party", "seiren", "old-lady",
];

try {
  for (let index = 0; index < 90; index += 1) {
    if (selectedIndexes.size && !selectedIndexes.has(index)) continue;
    const tier = index < 40 ? 1 : index < 70 ? 2 : 3;
    const sourceName = tier === 1
      ? backgrounds[index % backgrounds.length]
      : characters[(index - 40) % characters.length];
    const source = fileURLToPath(new URL(`../public/assets/cards/${sourceName}.png`, import.meta.url));
    const stage = join(stagingDirectory, `card-${String(index).padStart(3, "0")}.jpg`);
    const destination = join(outputDirectory, `card-${String(index).padStart(3, "0")}.jpg`);

    // 원본이 정사각형이 아니면 먼저 가운데를 정사각형으로 잘라 검은 여백이 생기지 않게 해요.
    const { stdout } = await execFileAsync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", source]);
    const side = String(Math.min(...stdout.match(/\d+$/gm).map(Number)));
    // sips는 한 번에 넘기면 리사이즈를 먼저 해버려서 자르기와 리사이즈를 따로 실행해요.
    const square = join(stagingDirectory, `square-${index}.png`);
    await execFileAsync("sips", ["-c", side, side, source, "--out", square]);
    await execFileAsync("sips", [
      "-z", "760", "760",
      "-s", "format", "jpeg",
      "-s", "formatOptions", "84",
      square,
      "--out", stage,
    ]);

    // Deterministic crop and mirror combinations make every physical art file distinct.
    const crop = 520 + (index % 5) * 22;
    const offsetY = (index * 31) % 84;
    const offsetX = (index * 47) % 84;
    await execFileAsync("sips", ["-c", String(crop), String(crop), "--cropOffset", String(offsetY), String(offsetX), stage]);
    if (index % 4 === 1) await execFileAsync("sips", ["-f", "horizontal", stage]);

    await rename(stage, destination);
  }
} finally {
  await rm(stagingDirectory, { recursive: true, force: true });
}

console.log(selectedIndexes.size ? `regenerated ${selectedIndexes.size} selected card illustrations` : "generated 90 unique JPEG card illustrations");
