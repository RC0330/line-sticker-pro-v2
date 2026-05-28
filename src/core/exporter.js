import JSZip from "jszip";
import { saveAs } from "file-saver";
import { editorStore } from "../store/editorStore.js";

export const EXPORT_PRESETS = {
  scale1: { label: "原始裁切 1x", type: "scale", scale: 1 },
  scale2: { label: "原始裁切 2x", type: "scale", scale: 2 },
  scale3: { label: "原始裁切 3x", type: "scale", scale: 3 },
  lineSticker: { label: "LINE貼圖 370×320內", type: "fit", width: 370, height: 320 },
  lineStickerMain: { label: "LINE貼圖主圖 240×240", type: "cover", width: 240, height: 240 },
  lineStickerTab: { label: "LINE貼圖Tab 96×74", type: "cover", width: 96, height: 74 },
  lineEmoji: { label: "LINE表情貼 180×180", type: "cover", width: 180, height: 180 },
  lineEmojiTab: { label: "LINE表情貼Tab 96×74", type: "cover", width: 96, height: 74 }
};

function safeName(name, fallback) {
  return String(name || fallback)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80) || fallback;
}

function getExportPreset(options = {}) {
  const key = options.preset || editorStore.exportOptions?.preset || "scale1";
  return EXPORT_PRESETS[key] || EXPORT_PRESETS.scale1;
}

function makeTransparentCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function drawCropRawCanvas(box, scale = 1) {
  const source = editorStore.image;
  if (!source) throw new Error("尚未上傳圖片");

  const canvas = makeTransparentCanvas(box.width * scale, box.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  ctx.save();
  ctx.scale(scale, scale);
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  ctx.translate(box.width / 2, box.height / 2);
  // 這裡會依裁切框旋轉角度取樣：旋轉過的裁切框會輸出對應角度的內容。
  ctx.rotate(-(box.rotation || 0));
  ctx.translate(-centerX, -centerY);
  ctx.drawImage(source, 0, 0);
  ctx.restore();

  return canvas;
}

function drawCanvasIntoPreset(sourceCanvas, preset, options = {}) {
  if (preset.type === "scale") return sourceCanvas;

  const target = makeTransparentCanvas(preset.width, preset.height);
  const ctx = target.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const margin = Math.max(0, Number(options.margin || 0));
  const safeW = Math.max(1, preset.width - margin * 2);
  const safeH = Math.max(1, preset.height - margin * 2);

  const ratio = preset.type === "cover"
    ? Math.max(safeW / sourceCanvas.width, safeH / sourceCanvas.height)
    : Math.min(safeW / sourceCanvas.width, safeH / sourceCanvas.height);

  const drawW = Math.max(1, sourceCanvas.width * ratio);
  const drawH = Math.max(1, sourceCanvas.height * ratio);
  const dx = (preset.width - drawW) / 2;
  const dy = (preset.height - drawH) / 2;
  ctx.drawImage(sourceCanvas, dx, dy, drawW, drawH);
  return target;
}

function drawCropToCanvas(box, options = {}) {
  const preset = getExportPreset(options);
  const scale = preset.type === "scale" ? Number(preset.scale || options.scale || 1) : 1;
  let canvas = drawCropRawCanvas(box, Math.max(1, scale));

  if (options.removeBackground) {
    removeBackgroundFromCanvas(canvas, {
      tolerance: options.tolerance,
      feather: options.feather
    });
  }

  canvas = drawCanvasIntoPreset(canvas, preset, options);
  return canvas;
}

function colorDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function averageCornerColor(data, width, height) {
  const samples = [];
  const pad = Math.max(2, Math.min(12, Math.floor(Math.min(width, height) * 0.06)));
  const areas = [
    [0, 0, pad, pad],
    [width - pad, 0, width, pad],
    [0, height - pad, pad, height],
    [width - pad, height - pad, width, height]
  ];

  areas.forEach(([x1, y1, x2, y2]) => {
    for (let y = y1; y < y2; y++) {
      for (let x = x1; x < x2; x++) {
        const i = (y * width + x) * 4;
        if (data[i + 3] > 10) samples.push([data[i], data[i + 1], data[i + 2]]);
      }
    }
  });

  if (!samples.length) return [255, 255, 255];
  const sum = samples.reduce((acc, c) => {
    acc[0] += c[0];
    acc[1] += c[1];
    acc[2] += c[2];
    return acc;
  }, [0, 0, 0]);
  return sum.map((v) => v / samples.length);
}

function removeBackgroundFromCanvas(canvas, options = {}) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const bg = averageCornerColor(data, width, height);
  const tolerance = Math.max(1, Number(options.tolerance ?? editorStore.bgTolerance ?? 34));
  const feather = Math.max(0, Number(options.feather ?? editorStore.bgFeather ?? 8));
  const visited = new Uint8Array(width * height);
  const queue = [];

  function tryPush(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (visited[p]) return;
    const i = p * 4;
    if (data[i + 3] === 0) {
      visited[p] = 1;
      queue.push(p);
      return;
    }
    if (colorDistance([data[i], data[i + 1], data[i + 2]], bg) <= tolerance + feather) {
      visited[p] = 1;
      queue.push(p);
    }
  }

  for (let x = 0; x < width; x++) {
    tryPush(x, 0);
    tryPush(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    tryPush(0, y);
    tryPush(width - 1, y);
  }

  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    const x = p % width;
    const y = Math.floor(p / width);
    tryPush(x + 1, y);
    tryPush(x - 1, y);
    tryPush(x, y + 1);
    tryPush(x, y - 1);
  }

  for (let p = 0; p < visited.length; p++) {
    if (!visited[p]) continue;
    const i = p * 4;
    const dist = colorDistance([data[i], data[i + 1], data[i + 2]], bg);
    if (dist <= tolerance) {
      data[i + 3] = 0;
    } else if (feather > 0 && dist <= tolerance + feather) {
      const keep = (dist - tolerance) / feather;
      data[i + 3] = Math.round(data[i + 3] * keep);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG 產生失敗"));
    }, "image/png");
  });
}

function saveBlob(blob, filename) {
  try {
    saveAs(blob, filename);
  } catch (error) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
}

function getExportBoxes(onlySelected = false) {
  let indices = editorStore.boxes.map((_, index) => index);
  if (onlySelected) {
    if (editorStore.selected?.length) {
      indices = editorStore.selected;
    } else if (Number.isInteger(editorStore.activeBox) && editorStore.activeBox >= 0) {
      indices = [editorStore.activeBox];
    } else {
      indices = [];
    }
  }

  return indices
    .map((index) => ({ index, box: editorStore.boxes[index] }))
    .filter(({ box }) => box && box.visible !== false && box.width > 0 && box.height > 0);
}

export async function exportSelectedPng() {
  const items = getExportBoxes(true);
  if (!editorStore.image) return alert("請先上傳圖片");
  if (!items.length) return alert("請先選取至少一個裁切框");

  if (items.length === 1) {
    const { index, box } = items[0];
    const canvas = drawCropToCanvas(box, editorStore.exportOptions);
    const blob = await canvasToBlob(canvas);
    saveBlob(blob, `${safeName(box.name, `crop-${index + 1}`)}-${safeName(getExportPreset(editorStore.exportOptions).label, "png")}.png`);
    return;
  }

  await exportZip(true);
}

export async function exportZip(onlySelected = false) {
  const items = getExportBoxes(onlySelected);
  if (!editorStore.image) return alert("請先上傳圖片");
  if (!items.length) return alert("沒有可匯出的裁切框");

  const zip = new JSZip();
  for (let i = 0; i < items.length; i++) {
    const { index, box } = items[i];
    const canvas = drawCropToCanvas(box, editorStore.exportOptions);
    const blob = await canvasToBlob(canvas);
    zip.file(`${String(i + 1).padStart(2, "0")}-${safeName(box.name, `crop-${index + 1}`)}-${safeName(getExportPreset(editorStore.exportOptions).label, "png")}.png`, blob);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  saveBlob(blob, onlySelected ? "selected-crops-line-transparent-png.zip" : "all-crops-line-transparent-png.zip");
}

export function previewCrop() {
  const preview = document.getElementById("cropPreview");
  if (!preview) return;
  preview.innerHTML = "";

  const items = getExportBoxes(true).slice(0, 6);
  if (!editorStore.image || !items.length) {
    preview.innerHTML = `<div class="preview-empty">選取裁切框後可預覽透明 PNG</div>`;
    return;
  }

  items.forEach(({ box }) => {
    const canvas = drawCropToCanvas(box, editorStore.exportOptions);
    const img = document.createElement("img");
    img.src = canvas.toDataURL("image/png");
    const wrap = document.createElement("div");
    wrap.className = "crop-preview-item";
    wrap.appendChild(img);
    preview.appendChild(wrap);
  });
}
