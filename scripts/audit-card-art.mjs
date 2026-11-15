import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createDeck } from "../src/game.js";

function jpegDimensions(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error("JPEG 파일이 아닙니다.");
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = buffer.readUInt16BE(offset);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  throw new Error("JPEG 크기를 읽을 수 없습니다.");
}

const cards = [1, 2, 3].flatMap((tier) => createDeck(tier));
const paths = cards.map((card) => card.art);
const failures = [];
const hashes = new Map();

if (cards.length !== 90) failures.push(`카드 수: ${cards.length}장 (90장이어야 함)`);
if (new Set(paths).size !== 90) failures.push(`일러스트 경로가 ${new Set(paths).size}개뿐입니다.`);

for (const [index, artPath] of paths.entries()) {
  const localPath = new URL(`../public/assets/cards/${artPath}`, import.meta.url);
  try {
    const buffer = await readFile(localPath);
    const hash = createHash("sha256").update(buffer).digest("hex");
    const dimensions = jpegDimensions(buffer);
    if (hashes.has(hash)) failures.push(`${artPath}가 ${hashes.get(hash)}와 완전히 같은 이미지입니다.`);
    hashes.set(hash, artPath);
    if (dimensions.width < 500 || dimensions.height < 500) failures.push(`${artPath} 해상도가 낮습니다: ${dimensions.width}×${dimensions.height}`);
    if (Math.abs(dimensions.width / dimensions.height - 1) > 0.2) failures.push(`${artPath} 비율이 지나치게 길쭉합니다: ${dimensions.width}×${dimensions.height}`);
  } catch (error) {
    failures.push(`${index + 1}번 카드 ${artPath}: ${error.message}`);
  }
}

if (failures.length) {
  console.error(`카드 일러스트 감사 실패 (${failures.length}건)`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`카드 일러스트 감사 통과: ${cards.length}장 · 경로 ${new Set(paths).size}개 · 고유 해시 ${hashes.size}개 · 전부 500px 이상`);
}
