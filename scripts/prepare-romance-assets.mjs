import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const headerSrc =
  "C:/Users/ari20/.cursor/projects/c-Users-ari20-Desktop-app-version-1-0-0/assets/c__Users_ari20_AppData_Roaming_Cursor_User_workspaceStorage_3abfa33848781f1eff59d3f7a03a91e7_images_image-d1ed843e-6f17-4a07-86e3-36c985776cdc.png";
const refSrc =
  "C:/Users/ari20/.cursor/projects/c-Users-ari20-Desktop-app-version-1-0-0/assets/c__Users_ari20_AppData_Roaming_Cursor_User_workspaceStorage_3abfa33848781f1eff59d3f7a03a91e7_images_image-5c5c7166-b99a-4c0b-9f00-be1768968e47.png";

const headerDest = path.join(root, "public/images/headers/romance-drama-cinematic.png");
const refDest = path.join(root, "public/images/characters/romance/reference-full.png");
const outDir = path.join(root, "public/images/characters/romance");

fs.mkdirSync(path.dirname(headerDest), { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

if (!fs.existsSync(headerSrc) || !fs.existsSync(refSrc)) {
  console.error("Source assets missing");
  process.exit(1);
}

fs.copyFileSync(headerSrc, headerDest);
fs.copyFileSync(refSrc, refDest);

const sharp = (await import("sharp")).default;
const meta = await sharp(refDest).metadata();
const W = meta.width ?? 0;
const H = meta.height ?? 0;

const headerTop = Math.round(H * 0.34);
const cardH = Math.round((H - headerTop) / 4);
const portraitW = Math.round(W * 0.38);
const left = Math.round(W * 0.04);

const names = ["lucien-vale", "kael-veyr", "ayame-noctis", "dante-ward"];

for (let i = 0; i < 4; i++) {
  const top = headerTop + i * cardH;
  const height = Math.min(cardH - 4, H - top);
  await sharp(refDest)
    .extract({ left, top, width: portraitW, height })
    .png()
    .toFile(path.join(outDir, `${names[i]}.png`));
}

console.log("Romance assets prepared");
