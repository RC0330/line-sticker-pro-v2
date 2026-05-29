import JSZip from "jszip";
import { saveAs } from "file-saver";
import { editorStore } from "../store/editorStore.js";

export const EXPORT_PRESETS = {
  scale1: { label: "原始裁切 1x", type: "scale", scale: 1 },
  scale2: { label: "原始裁切 2x", type: "scale", scale: 2 },
  scale3: { label: "原始裁切 3x", type: "scale", scale: 3 },
  lineSticker: {
    label: "LINE貼圖 370×320內",
    type: "fit",
    width: 370,
    height: 320,
  },
  lineStickerMain: {
    label: "LINE貼圖主圖 240×240",
    type: "cover",
    width: 240,
    height: 240,
  },
  lineStickerTab: {
    label: "LINE貼圖Tab 96×74",
    type: "cover",
    width: 96,
    height: 74,
  },
  lineEmoji: {
    label: "LINE表情貼 180×180",
    type: "cover",
    width: 180,
    height: 180,
  },
  lineEmojiTab: {
    label: "LINE表情貼Tab 96×74",
    type: "cover",
    width: 96,
    height: 74,
  },
};

function safeName(name, fallback) {
  return (
    String(name || fallback)
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .slice(0, 80) || fallback
  );
}

function getExportPreset(options = {}) {
  const key = options.preset || editorStore.exportOptions?.preset || "scale1";
  return EXPORT_PRESETS[key] || EXPORT_PRESETS.scale1;
}

function getFilenamePrefix(options = {}) {
  return safeName(
    options.filenamePrefix ||
      editorStore.exportOptions?.filenamePrefix ||
      "sticker",
    "sticker",
  );
}

function getDigits(total) {
  return Math.max(2, String(Math.max(1, total)).length);
}

function buildExportFilename(sequence, total, options = {}) {
  const prefix = getFilenamePrefix(options);
  const digits = getDigits(total);
  return `${prefix}_${String(sequence).padStart(digits, "0")}.png`;
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

  const ratio =
    preset.type === "cover"
      ? Math.max(safeW / sourceCanvas.width, safeH / sourceCanvas.height)
      : Math.min(safeW / sourceCanvas.width, safeH / sourceCanvas.height);

  const drawW = Math.max(1, sourceCanvas.width * ratio);
  const drawH = Math.max(1, sourceCanvas.height * ratio);
  const dx = (preset.width - drawW) / 2;
  const dy = (preset.height - drawH) / 2;
  ctx.drawImage(sourceCanvas, dx, dy, drawW, drawH);
  return target;
}

function colorDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function averageCornerColor(data, width, height) {
  const samples = [];
  const pad = Math.max(
    2,
    Math.min(12, Math.floor(Math.min(width, height) * 0.06)),
  );
  const areas = [
    [0, 0, pad, pad],
    [width - pad, 0, width, pad],
    [0, height - pad, pad, height],
    [width - pad, height - pad, width, height],
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
  const sum = samples.reduce(
    (acc, c) => {
      acc[0] += c[0];
      acc[1] += c[1];
      acc[2] += c[2];
      return acc;
    },
    [0, 0, 0],
  );
  return sum.map((v) => v / samples.length);
}

function removeBackgroundFromCanvas(canvas, options = {}) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const bg = averageCornerColor(data, width, height);
  const tolerance = Math.max(
    1,
    Number(options.tolerance ?? editorStore.bgTolerance ?? 34),
  );
  const feather = Math.max(
    0,
    Number(options.feather ?? editorStore.bgFeather ?? 8),
  );
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
    if (
      colorDistance([data[i], data[i + 1], data[i + 2]], bg) <=
      tolerance + feather
    ) {
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

function drawCropToCanvas(box, options = {}) {
  const preset = getExportPreset(options);
  const scale =
    preset.type === "scale" ? Number(preset.scale || options.scale || 1) : 1;
  let canvas = drawCropRawCanvas(box, Math.max(1, scale));

  if (options.removeBackground) {
    removeBackgroundFromCanvas(canvas, {
      tolerance: options.tolerance,
      feather: options.feather,
    });
  }

  canvas = drawCanvasIntoPreset(canvas, preset, options);
  return canvas;
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
    } else if (
      Number.isInteger(editorStore.activeBox) &&
      editorStore.activeBox >= 0
    ) {
      indices = [editorStore.activeBox];
    } else {
      indices = [];
    }
  }

  return indices
    .map((index) => ({ index, box: editorStore.boxes[index] }))
    .filter(
      ({ box }) =>
        box && box.visible !== false && box.width > 0 && box.height > 0,
    );
}

function getCanvasAlphaStats(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const total = width * height;
  let transparent = 0;
  let semiTransparent = 0;

  for (let i = 3; i < data.length; i += 4) {
    const alpha = data[i];
    if (alpha === 0) transparent += 1;
    else if (alpha < 255) semiTransparent += 1;
  }

  return {
    totalPixels: total,
    transparentPixels: transparent,
    semiTransparentPixels: semiTransparent,
    hasTransparency: transparent > 0 || semiTransparent > 0,
    transparencyRatio: total ? (transparent + semiTransparent) / total : 0,
  };
}

function analyzeLineExportItem(
  canvas,
  box,
  index,
  sequence,
  total,
  options = {},
) {
  const preset = getExportPreset(options);
  const exportPresetKey =
    options.preset || editorStore.exportOptions?.preset || "scale1";
  const isLinePreset = exportPresetKey.startsWith("line");
  const alpha = getCanvasAlphaStats(canvas);
  const warnings = [];

  if (!isLinePreset) {
    warnings.push("目前選擇的輸出規格不是 LINE 專用規格");
  }

  if (isLinePreset && preset.width && preset.height) {
    if (canvas.width !== preset.width || canvas.height !== preset.height) {
      warnings.push(
        `輸出尺寸應為 ${preset.width}×${preset.height}，目前為 ${canvas.width}×${canvas.height}`,
      );
    }
  }

  if (options.removeBackground && !alpha.hasTransparency) {
    warnings.push("已勾選去底，但輸出結果幾乎沒有透明像素，請檢查去底容差");
  }

  if (!options.removeBackground) {
    warnings.push("目前未勾選去底輸出，透明背景檢查不會通過");
  }

  return {
    cropIndex: index + 1,
    cropName: box.name || `Crop ${index + 1}`,
    sequence,
    filename: buildExportFilename(sequence, total, options),
    width: canvas.width,
    height: canvas.height,
    hasTransparency: alpha.hasTransparency,
    transparencyRatio: alpha.transparencyRatio,
    warnings,
    passed: warnings.length === 0,
  };
}

export function getLineExportReport(onlySelected = false) {
  const items = getExportBoxes(onlySelected);
  const options = editorStore.exportOptions || {};

  if (!editorStore.image) {
    return {
      ok: false,
      summary: "請先上傳圖片",
      items: [],
    };
  }

  if (!items.length) {
    return {
      ok: false,
      summary: onlySelected
        ? "請先選取至少一個裁切框"
        : "目前沒有可匯出的 Crop",
      items: [],
    };
  }

  const reportItems = items.map(({ index, box }, order) => {
    const canvas = drawCropToCanvas(box, options);
    return analyzeLineExportItem(
      canvas,
      box,
      index,
      order + 1,
      items.length,
      options,
    );
  });

  const passedCount = reportItems.filter((item) => item.passed).length;
  const failedCount = reportItems.length - passedCount;
  const preset = getExportPreset(options);
  const lineModeLabel = preset.label || "匯出規格";
  const summary =
    failedCount === 0
      ? `檢查完成：${reportItems.length} 個 Crop 都可用於 ${lineModeLabel} 輸出。`
      : `檢查完成：${passedCount} 個通過，${failedCount} 個需要留意。`;

  return {
    ok: failedCount === 0,
    summary,
    items: reportItems,
    presetLabel: lineModeLabel,
    filenamePreview: buildExportFilename(1, reportItems.length, options),
  };
}

export function renderLineExportReport(onlySelected = false) {
  const target = document.getElementById("lineCheckReport");
  if (!target) return null;

  const report = getLineExportReport(onlySelected);
  if (!report.items.length) {
    target.innerHTML = `<div class="preview-empty">${report.summary}</div>`;
    return report;
  }

  const rows = report.items
    .map((item) => {
      const transparencyText = item.hasTransparency
        ? `有透明背景 (${Math.round(item.transparencyRatio * 100)}%)`
        : "未偵測到透明背景";
      const warningHtml = item.warnings.length
        ? `<ul>${item.warnings.map((warning) => `<li>${warning}</li>`).join("")}</ul>`
        : `<div class="line-check-ok">✓ 通過</div>`;
      return `
        <div class="line-check-item ${item.passed ? "passed" : "warning"}">
          <div class="line-check-header">
            <strong>${item.filename}</strong>
            <span>${item.cropName}</span>
          </div>
          <div class="line-check-meta">尺寸：${item.width}×${item.height}｜${transparencyText}</div>
          <div class="line-check-notes">${warningHtml}</div>
        </div>
      `;
    })
    .join("");

  target.innerHTML = `
    <div class="line-check-summary ${report.ok ? "ok" : "warning"}">
      <div><strong>${report.summary}</strong></div>
      <div>檔名預覽：${report.filenamePreview}</div>
      <div>目前輸出規格：${report.presetLabel}</div>
    </div>
    <div class="line-check-list">${rows}</div>
  `;

  return report;
}


export function renderStickerWallPreview(columns = 4, rows = 4) {
  const wall = document.getElementById("stickerWallPreview");
  const meta = document.getElementById("stickerWallMeta");
  if (!wall) return null;

  const cols = Math.max(1, Math.min(12, Number(columns) || 4));
  const rowCount = Math.max(1, Math.min(20, Number(rows) || 4));
  const capacity = cols * rowCount;
  const items = getExportBoxes(false);

  wall.innerHTML = "";
  wall.style.setProperty("--wall-columns", String(cols));

  if (!editorStore.image) {
    wall.innerHTML = `<div class="preview-empty">請先上傳圖片，才能預覽 LINE 貼圖牆。</div>`;
    if (meta) meta.textContent = "尚未上傳圖片";
    return null;
  }

  if (!items.length) {
    wall.innerHTML = `<div class="preview-empty">目前沒有可預覽的 Crop。</div>`;
    if (meta) meta.textContent = "目前沒有 Crop";
    return null;
  }

  const shownCount = Math.min(capacity, items.length);
  for (let i = 0; i < capacity; i += 1) {
    const cell = document.createElement("div");
    cell.className = "sticker-wall-cell";

    if (i < items.length) {
      const { box } = items[i];
      const canvas = drawCropToCanvas(box, editorStore.exportOptions || {});
      const img = document.createElement("img");
      img.src = canvas.toDataURL("image/png");
      img.alt = box.name || `Crop ${i + 1}`;
      img.loading = "lazy";

      const name = document.createElement("div");
      name.className = "sticker-wall-name";
      name.textContent = buildExportFilename(i + 1, items.length, editorStore.exportOptions || {});

      const cropName = document.createElement("div");
      cropName.className = "sticker-wall-cropname";
      cropName.textContent = box.name || `Crop ${i + 1}`;

      cell.appendChild(img);
      cell.appendChild(name);
      cell.appendChild(cropName);
    } else {
      cell.classList.add("empty");
      cell.innerHTML = `<div class="sticker-wall-empty">空白格</div>`;
    }

    wall.appendChild(cell);
  }

  if (meta) {
    const extra = items.length > capacity ? `，其餘 ${items.length - capacity} 個 Crop 尚未顯示` : "";
    meta.textContent = `貼圖牆預覽：${cols}×${rowCount}（共 ${capacity} 格），目前顯示 ${shownCount} / ${items.length} 個 Crop${extra}。`;
  }

  return { columns: cols, rows: rowCount, capacity, total: items.length, shown: shownCount };
}

export async function exportSelectedPng() {
  const items = getExportBoxes(true);
  if (!editorStore.image) return alert("請先上傳圖片");
  if (!items.length) return alert("請先選取至少一個裁切框");

  if (items.length === 1) {
    const { box } = items[0];
    const filename = buildExportFilename(1, 1, editorStore.exportOptions);
    const canvas = drawCropToCanvas(box, editorStore.exportOptions);
    const blob = await canvasToBlob(canvas);
    saveBlob(blob, filename);
    return;
  }

  await exportZip(true);
}

export async function exportZip(onlySelected = false) {
  const items = getExportBoxes(onlySelected);
  if (!editorStore.image) return alert("請先上傳圖片");
  if (!items.length) return alert("沒有可匯出的裁切框");

  const zip = new JSZip();
  for (let i = 0; i < items.length; i += 1) {
    const { box } = items[i];
    const canvas = drawCropToCanvas(box, editorStore.exportOptions);
    const blob = await canvasToBlob(canvas);
    zip.file(
      buildExportFilename(i + 1, items.length, editorStore.exportOptions),
      blob,
    );
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const prefix = getFilenamePrefix(editorStore.exportOptions);
  saveBlob(
    blob,
    `${prefix}-${onlySelected ? "selected" : "all"}-line-transparent-png.zip`,
  );
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

  items.forEach(({ box }, order) => {
    const canvas = drawCropToCanvas(box, editorStore.exportOptions);
    const img = document.createElement("img");
    img.src = canvas.toDataURL("image/png");
    const wrap = document.createElement("div");
    wrap.className = "crop-preview-item";
    const caption = document.createElement("div");
    caption.className = "crop-preview-caption";
    caption.textContent = buildExportFilename(
      order + 1,
      items.length,
      editorStore.exportOptions,
    );
    wrap.appendChild(img);
    wrap.appendChild(caption);
    preview.appendChild(wrap);
  });
}
