import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const MAX_EDGE = Number(process.env.IMAGE_MAX_EDGE || 512);
const JPEG_QUALITY = Number(process.env.IMAGE_JPEG_QUALITY || 64);
const MAX_BATCH_IMAGES = Number(process.env.MAX_BATCH_IMAGES || 4);
const MAX_BATCH_BYTES = Number(process.env.MAX_BATCH_BYTES || 3 * 1024 * 1024);

export async function prepareImages({ files, runDir, emit }) {
  const preparedDir = path.join(runDir, "prepared");
  await mkdir(preparedDir, { recursive: true });

  const images = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    emit("trace", {
      provider: "system",
      phase: "prep",
      message: `Normalizing ${index + 1}/${files.length}: ${file.originalname}`
    });

    const image = sharp(file.path, { failOn: "none" }).rotate();
    const metadata = await image.metadata();
    const outputName = `${String(index + 1).padStart(3, "0")}-${safeName(file.originalname).replace(/\.[^.]+$/, "")}.jpg`;
    const outputPath = path.join(preparedDir, outputName);
    const buffer = await image
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    await writeFile(outputPath, buffer);

    images.push({
      id: `${index + 1}`,
      originalName: file.originalname,
      preparedName: outputName,
      inputPath: file.path,
      preparedPath: outputPath,
      mimeType: "image/jpeg",
      width: metadata.width || null,
      height: metadata.height || null,
      preparedBytes: buffer.length,
      base64: buffer.toString("base64"),
      dataUrl: `data:image/jpeg;base64,${buffer.toString("base64")}`,
      previewUrl: `/outputs/runs/${path.basename(runDir)}/prepared/${outputName}`
    });
  }

  emit("trace", {
    provider: "system",
    phase: "prep",
    message: `Prepared ${images.length} images for batched agent requests`
  });
  return images;
}

export function makeBatches(images) {
  const batches = [];
  let current = [];
  let currentBytes = 0;

  for (const image of images) {
    const estimatedJsonBytes = Math.ceil(image.preparedBytes * 1.37) + 1024;
    const wouldOverflow =
      current.length > 0 &&
      (current.length >= MAX_BATCH_IMAGES || currentBytes + estimatedJsonBytes > MAX_BATCH_BYTES);

    if (wouldOverflow) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }

    current.push(image);
    currentBytes += estimatedJsonBytes;
  }

  if (current.length) batches.push(current);
  return batches;
}

function safeName(value) {
  return String(value || "image")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}
