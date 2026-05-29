import { editorStore } from "../store/editorStore.js";
import { saveHistory } from "./history.js";
import { draw } from "./canvas.js";
import { renderLayers } from "../ui/layer-panel.js";

function getTargetIndices(preferSelection = true) {
  if (preferSelection && Array.isArray(editorStore.selected) && editorStore.selected.length) {
    return [...new Set(editorStore.selected)].filter((index) => Number.isInteger(index) && editorStore.boxes[index]);
  }
  return editorStore.boxes
    .map((box, index) => (box ? index : null))
    .filter((index) => index !== null);
}

function padNumber(value, total) {
  return String(value).padStart(Math.max(2, String(Math.max(1, total)).length), "0");
}

function parseCropNumber(box, fallbackIndex = 0) {
  const name = String(box?.name || "");
  const match = name.match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : fallbackIndex + 1;
}

function refreshSelectionAfterMutation() {
  editorStore.selected = [...new Set(editorStore.selected)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < editorStore.boxes.length);
  editorStore.activeBox = editorStore.selected.length ? editorStore.selected[0] : -1;
}

export function renumberCrops(prefix = "Crop", { selectedOnly = false } = {}) {
  const indices = selectedOnly ? getTargetIndices(true) : getTargetIndices(false);
  if (!indices.length) return 0;

  const total = selectedOnly ? indices.length : editorStore.boxes.length;
  indices.forEach((index, order) => {
    const box = editorStore.boxes[index];
    if (!box) return;
    box.name = `${prefix} ${padNumber(order + 1, total)}`;
  });
  renderLayers();
  draw();
  return indices.length;
}

export function sortCropsByNumber() {
  if (!editorStore.boxes.length) {
    alert("目前沒有 Crop 可排序");
    return;
  }
  saveHistory();

  const selectedRefs = new Set(editorStore.selected.map((index) => editorStore.boxes[index]).filter(Boolean));
  const activeRef = editorStore.boxes[editorStore.activeBox] || null;

  editorStore.boxes.sort((a, b) => parseCropNumber(a) - parseCropNumber(b));
  editorStore.boxes.forEach((box, index) => {
    box.name = `Crop ${padNumber(index + 1, editorStore.boxes.length)}`;
  });

  editorStore.selected = editorStore.boxes
    .map((box, index) => (selectedRefs.has(box) ? index : null))
    .filter((index) => index !== null);
  editorStore.activeBox = activeRef ? editorStore.boxes.indexOf(activeRef) : (editorStore.selected[0] ?? -1);
  refreshSelectionAfterMutation();
  renderLayers();
  draw();
}

export function batchRenameCrops(prefix = "Crop") {
  const safePrefix = String(prefix || "Crop").trim() || "Crop";
  const targetIndices = editorStore.selected?.length ? getTargetIndices(true) : getTargetIndices(false);
  if (!targetIndices.length) {
    alert("請先建立至少一個 Crop");
    return 0;
  }

  saveHistory();
  const total = targetIndices.length;
  targetIndices.forEach((index, order) => {
    const box = editorStore.boxes[index];
    if (!box) return;
    box.name = `${safePrefix} ${padNumber(order + 1, total)}`;
  });

  renderLayers();
  draw();
  return total;
}

export function toggleSelectAllCrops() {
  const selectable = editorStore.boxes
    .map((box, index) => (box && box.visible !== false ? index : null))
    .filter((index) => index !== null);
  const allSelected = selectable.length > 0 && selectable.every((index) => editorStore.selected.includes(index));
  editorStore.selected = allSelected ? [] : selectable;
  editorStore.activeBox = editorStore.selected[0] ?? -1;
  renderLayers();
  draw();
  return !allSelected;
}

function makeCloneName(sourceName, offset, total) {
  const base = String(sourceName || "Crop").replace(/\s+\d+$/, "").trim() || "Crop";
  return `${base} ${padNumber(total + offset, total + offset)}`;
}

export function duplicateSelectedCrops() {
  const indices = getTargetIndices(true);
  if (!indices.length) {
    alert("請先選取要複製的 Crop");
    return 0;
  }
  saveHistory();
  const clones = [];
  indices.forEach((index, offset) => {
    const box = editorStore.boxes[index];
    if (!box) return;
    clones.push({
      ...structuredClone(box),
      x: box.x + 12,
      y: box.y + 12,
      locked: false,
      name: makeCloneName(box.name, offset + 1, editorStore.boxes.length)
    });
  });
  editorStore.boxes.push(...clones);
  editorStore.boxes.forEach((box, index) => {
    if (!box.name || /^Crop\b/i.test(box.name)) {
      box.name = `Crop ${padNumber(index + 1, editorStore.boxes.length)}`;
    }
  });
  editorStore.selected = clones.map((_, offset) => editorStore.boxes.length - clones.length + offset);
  editorStore.activeBox = editorStore.selected[0] ?? -1;
  renderLayers();
  draw();
  return clones.length;
}

function createRawCropCanvas(box) {
  const source = editorStore.image;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(box.width));
  canvas.height = Math.max(1, Math.round(box.height));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  ctx.save();
  ctx.translate(box.width / 2, box.height / 2);
  ctx.rotate(-(box.rotation || 0));
  ctx.translate(-centerX, -centerY);
  ctx.drawImage(source, 0, 0);
  ctx.restore();
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
    for (let y = y1; y < y2; y += 1) {
      for (let x = x1; x < x2; x += 1) {
        const i = (y * width + x) * 4;
        samples.push([data[i], data[i + 1], data[i + 2]]);
      }
    }
  });
  if (!samples.length) return [255, 255, 255];
  const sum = samples.reduce((acc, item) => {
    acc[0] += item[0];
    acc[1] += item[1];
    acc[2] += item[2];
    return acc;
  }, [0, 0, 0]);
  return sum.map((value) => value / samples.length);
}

function isCropNearlyEmpty(box) {
  if (!editorStore.image || !box || box.width < 2 || box.height < 2) return true;
  const canvas = createRawCropCanvas(box);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);
  const bg = averageCornerColor(data, width, height);
  const tolerance = 24;
  let contentPixels = 0;
  const total = width * height;
  for (let i = 0; i < data.length; i += 4) {
    const dist = colorDistance([data[i], data[i + 1], data[i + 2]], bg);
    if (dist > tolerance) contentPixels += 1;
  }
  return (contentPixels / Math.max(1, total)) < 0.025;
}

export function deleteEmptyCrops() {
  if (!editorStore.boxes.length) {
    alert("目前沒有 Crop");
    return 0;
  }
  if (!editorStore.image) {
    alert("請先上傳圖片");
    return 0;
  }
  const keep = [];
  const removed = [];
  editorStore.boxes.forEach((box, index) => {
    if (isCropNearlyEmpty(box)) removed.push(index);
    else keep.push(box);
  });
  if (!removed.length) {
    alert("未偵測到空白 Crop");
    return 0;
  }
  saveHistory();
  editorStore.boxes = keep;
  editorStore.boxes.forEach((box, index) => {
    if (!box.name || /^Crop\b/i.test(box.name)) box.name = `Crop ${padNumber(index + 1, editorStore.boxes.length)}`;
  });
  editorStore.selected = [];
  editorStore.activeBox = -1;
  refreshSelectionAfterMutation();
  renderLayers();
  draw();
  return removed.length;
}

export function applyReferenceSizeToAll() {
  const targetIndices = getTargetIndices(true);
  const referenceIndex = targetIndices[0] ?? editorStore.activeBox;
  const reference = editorStore.boxes[referenceIndex];
  if (!reference) {
    alert("請先選取一個 Crop 作為尺寸基準");
    return 0;
  }

  saveHistory();
  let changed = 0;
  editorStore.boxes.forEach((box, index) => {
    if (!box || index === referenceIndex || box.locked) return;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    box.width = reference.width;
    box.height = reference.height;
    box.x = centerX - box.width / 2;
    box.y = centerY - box.height / 2;
    changed += 1;
  });
  renderLayers();
  draw();
  return changed;
}


export function setLockedForTargets(locked = true) {
  const targetIndices = editorStore.selected?.length ? getTargetIndices(true) : getTargetIndices(false);
  if (!targetIndices.length) {
    alert("請先建立或選取至少一個 Crop");
    return 0;
  }
  saveHistory();
  let changed = 0;
  targetIndices.forEach((index) => {
    const box = editorStore.boxes[index];
    if (!box) return;
    if (box.locked !== locked) changed += 1;
    box.locked = locked;
  });
  if (locked) {
    editorStore.selected = editorStore.selected.filter((index) => !targetIndices.includes(index));
  } else {
    editorStore.selected = [...new Set(targetIndices)];
  }
  editorStore.activeBox = editorStore.selected[0] ?? -1;
  renderLayers();
  draw();
  return changed || targetIndices.length;
}

export function setOpacityForTargets(opacity = 1) {
  const targetIndices = editorStore.selected?.length ? getTargetIndices(true) : getTargetIndices(false);
  if (!targetIndices.length) {
    alert("請先建立或選取至少一個 Crop");
    return 0;
  }
  const value = Math.max(0, Math.min(1, Number(opacity) || 0));
  saveHistory();
  targetIndices.forEach((index) => {
    const box = editorStore.boxes[index];
    if (!box) return;
    box.opacity = value;
  });
  renderLayers();
  draw();
  return targetIndices.length;
}
