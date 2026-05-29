import { editorStore } from "../store/editorStore.js";
import { drawGuides } from "./guides.js";
import { pointInBox } from "./hitTest.js";
import { normalizeRect, boxTouchSelection } from "./selectionBox.js";
import { saveHistory } from "./history.js";
import { renderLayers } from "../ui/layer-panel.js";
import { getGuides } from "./guidesEngine.js";
import { getBounds } from "./bounds.js";
import { getHandles, hitHandle } from "./handles.js";
import {
  getBoxCenter,
  getBoxCorners,
  normalizeAngle,
  radiansToDegrees,
  rotatePoint
} from "./geometry.js";

let canvas;
let ctx;

let resizing = false;
let groupResizing = false;
let rotating = false;

let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartWidth = 0;
let resizeStartHeight = 0;
let resizeStartBoxX = 0;
let resizeStartBoxY = 0;
let resizeStartRotation = 0;

let dragOffsetX = 0;
let dragOffsetY = 0;

let groupResizeStartBounds = null;
let groupResizeStartBoxes = [];
let groupRotateStartAngle = 0;
let groupRotateCenter = null;

const MIN_BOX_SIZE = 20;
const MIN_GROUP_SIZE = 30;
const SNAP_DISTANCE = 8;
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 8;
const FIT_PADDING = 24;

const activePointers = new Map();
let pinchState = null;
let pinching = false;
let panningView = false;
let panStartPoint = null;
let panStartX = 0;
let panStartY = 0;

let longPressTimer = null;
let longPressPointerId = null;
let longPressTargetIndex = -1;
let longPressStartScreen = null;
let longPressTriggered = false;

let draggingGridGuide = null;
let gridGuideMoved = false;

const LONG_PRESS_MS = 360;
const DRAG_START_THRESHOLD = 22;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function initCanvas() {
  canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d");

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  draw();
}

function resizeCanvas() {
  const editor = document.querySelector(".editor");
  const rect = editor?.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect?.width || window.innerWidth));
  const height = Math.max(360, Math.floor(rect?.height || window.innerHeight * 0.58));

  canvas.width = width;
  canvas.height = height;

  if (editorStore.image && !editorStore.viewInitialized) fitImageToView(false);
  draw();
}

function drawHandle(h) {
  ctx.save();
  const z = editorStore.zoom || 1;
  const boxSize = 10 / z;
  const rotateRadius = 11 / z;

  if (h.isRotate) {
    ctx.beginPath();
    ctx.arc(h.x, h.y, rotateRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#00e5ff";
    ctx.fill();
    ctx.strokeStyle = "#083344";
    ctx.lineWidth = 2.4 / z;
    ctx.stroke();
    ctx.fillStyle = "#042f2e";
    ctx.font = `${12 / z}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("↻", h.x, h.y + 0.2 / z);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(h.x - boxSize / 2, h.y - boxSize / 2, boxSize, boxSize);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1 / z;
    ctx.strokeRect(h.x - boxSize / 2, h.y - boxSize / 2, boxSize, boxSize);
  }

  ctx.restore();
}

function createEmptyGridTemplate() {
  return { active: false, columns: 0, rows: 0, verticalLines: [], horizontalLines: [] };
}

function deactivateGridTemplate(clearLines = true) {
  editorStore.gridTemplate = clearLines
    ? createEmptyGridTemplate()
    : { ...(editorStore.gridTemplate || createEmptyGridTemplate()), active: false };
}

function createGridBoxesFromTemplate(template) {
  if (!editorStore.image?.width || !editorStore.image?.height) return [];
  const imageW = editorStore.image.width;
  const imageH = editorStore.image.height;
  const vertical = [...(template.verticalLines || [])].sort((a, b) => a - b);
  const horizontal = [...(template.horizontalLines || [])].sort((a, b) => a - b);
  const xEdges = [0, ...vertical, imageW];
  const yEdges = [0, ...horizontal, imageH];
  const boxes = [];
  for (let r = 0; r < yEdges.length - 1; r += 1) {
    for (let c = 0; c < xEdges.length - 1; c += 1) {
      boxes.push({
        x: xEdges[c],
        y: yEdges[r],
        width: xEdges[c + 1] - xEdges[c],
        height: yEdges[r + 1] - yEdges[r],
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        name: `Crop ${boxes.length + 1}`
      });
    }
  }
  return boxes;
}

function commitBoxes(boxes, statusText = "", { keepGridTemplate = false } = {}) {
  editorStore.boxes = boxes.map((box, index) => ({
    rotation: 0,
    visible: true,
    locked: false,
    opacity: 1,
    name: box.name || `Crop ${index + 1}`,
    ...box
  }));
  editorStore.selected = editorStore.boxes.length ? [0] : [];
  editorStore.activeBox = editorStore.boxes.length ? 0 : -1;
  editorStore.transformStatus = statusText;
  if (!keepGridTemplate) deactivateGridTemplate(true);
}

function syncBoxesFromGridTemplate(statusText = "已更新切割線") {
  if (!editorStore.gridTemplate?.active) return;
  const boxes = createGridBoxesFromTemplate(editorStore.gridTemplate);
  commitBoxes(boxes, statusText, { keepGridTemplate: true });
}

export function replaceBoxes(boxes, statusText = "", { keepGridTemplate = false } = {}) {
  if (editorStore.historyIndex < 0) saveHistory();
  commitBoxes(boxes, statusText, { keepGridTemplate });
  saveHistory();
  renderLayers();
  draw();
}

export function setEditableGridTemplate(columns, rows, statusText = "") {
  if (!editorStore.image?.width || !editorStore.image?.height) return [];
  const imageW = editorStore.image.width;
  const imageH = editorStore.image.height;
  const safeColumns = Math.max(1, Math.round(columns));
  const safeRows = Math.max(1, Math.round(rows));

  const verticalLines = [];
  const horizontalLines = [];
  for (let c = 1; c < safeColumns; c += 1) verticalLines.push((imageW * c) / safeColumns);
  for (let r = 1; r < safeRows; r += 1) horizontalLines.push((imageH * r) / safeRows);

  editorStore.gridTemplate = {
    active: true,
    columns: safeColumns,
    rows: safeRows,
    verticalLines,
    horizontalLines
  };

  if (editorStore.historyIndex < 0) saveHistory();
  syncBoxesFromGridTemplate(statusText || `已建立 ${safeColumns}×${safeRows} 可拖曳切割線模板`);
  saveHistory();
  renderLayers();
  draw();
  return editorStore.boxes;
}

function drawGridTemplateGuides() {
  const template = editorStore.gridTemplate;
  if (!template?.active || !editorStore.image) return;

  const zoom = editorStore.zoom || 1;
  const top = 0;
  const left = 0;
  const right = editorStore.image.width;
  const bottom = editorStore.image.height;

  ctx.save();
  ctx.fillStyle = "rgba(15,23,42,0.78)";
  ctx.fillRect(left + 10 / zoom, top + 10 / zoom, 218 / zoom, 30 / zoom);
  ctx.fillStyle = "rgba(226,232,240,0.95)";
  ctx.font = `${12 / zoom}px Arial`;
  ctx.fillText("點單格可編輯；拖青色線可調整切割線", left + 18 / zoom, top + 30 / zoom);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(34,211,238,0.95)";
  ctx.fillStyle = "rgba(34,211,238,0.95)";
  ctx.lineWidth = 2.5 / zoom;
  ctx.setLineDash([10 / zoom, 8 / zoom]);

  (template.verticalLines || []).forEach((x, index) => {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, top + 18 / zoom, 7 / zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${11 / zoom}px Arial`;
    ctx.fillText(`V${index + 1}`, x + 8 / zoom, top + 22 / zoom);
    ctx.setLineDash([10 / zoom, 8 / zoom]);
  });

  (template.horizontalLines || []).forEach((y, index) => {
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(left + 18 / zoom, y, 7 / zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${11 / zoom}px Arial`;
    ctx.fillText(`H${index + 1}`, left + 28 / zoom, y - 8 / zoom);
    ctx.setLineDash([10 / zoom, 8 / zoom]);
  });

  ctx.restore();
}

function hitGridTemplateGuide(pos) {
  const template = editorStore.gridTemplate;
  if (!template?.active || !editorStore.image) return null;
  const threshold = 9 / (editorStore.zoom || 1);

  for (let i = 0; i < (template.verticalLines || []).length; i += 1) {
    const x = template.verticalLines[i];
    if (Math.abs(pos.x - x) <= threshold && pos.y >= 0 && pos.y <= editorStore.image.height) {
      return { axis: "vertical", index: i };
    }
  }
  for (let i = 0; i < (template.horizontalLines || []).length; i += 1) {
    const y = template.horizontalLines[i];
    if (Math.abs(pos.y - y) <= threshold && pos.x >= 0 && pos.x <= editorStore.image.width) {
      return { axis: "horizontal", index: i };
    }
  }
  return null;
}


function getGridCellIndexAt(pos) {
  if (!editorStore.gridTemplate?.active) return -1;
  for (let index = 0; index < editorStore.boxes.length; index += 1) {
    const box = editorStore.boxes[index];
    if (!box || box.visible === false || box.locked) continue;
    if (pointInBox(pos.x, pos.y, box)) return index;
  }
  return -1;
}

function selectGridCell(index) {
  if (index < 0 || index >= editorStore.boxes.length) return false;
  editorStore.selected = [index];
  editorStore.activeBox = index;
  editorStore.deleteButtonBox = index;
  editorStore.hoverBox = -1;
  editorStore.transformStatus = `已選取第 ${index + 1} 格：可拖白點調整；拖青色線可改整列/欄`;
  renderLayers();
  draw();
  return true;
}

function handleGridTemplatePointerDown(e, pos) {
  if (!editorStore.gridTemplate?.active) return false;

  const gridGuideHit = hitGridTemplateGuide(pos);
  if (gridGuideHit) {
    startGridGuideDrag(gridGuideHit);
    renderLayers();
    draw();
    return true;
  }

  const selectedIndex = editorStore.selected.length === 1 ? editorStore.selected[0] : -1;
  const selectedBox = editorStore.boxes[selectedIndex];

  if (selectedBox && selectedBox.visible !== false && selectedBox.locked !== true) {
    if (isPointInDeleteButton(pos, selectedBox, selectedIndex)) {
      deleteBoxAt(selectedIndex);
      return true;
    }

    const handle = hitTransformHandles(pos, selectedBox);
    if (handle) {
      if (handle.name === "rotate") startRotate(pos, selectedIndex);
      else startSingleResize(pos, selectedIndex, handle.name);
      renderLayers();
      draw();
      return true;
    }
  }

  const cellIndex = getGridCellIndexAt(pos);
  if (cellIndex >= 0) {
    if (editorStore.mobileMultiSelectMode) {
      editorStore.deleteButtonBox = -1;
      toggleBoxSelection(cellIndex);
      editorStore.activeBox = editorStore.selected[0] ?? -1;
      editorStore.transformStatus = editorStore.selected.includes(cellIndex)
        ? `多選已加入 Crop ${cellIndex + 1}`
        : `多選已移除 Crop ${cellIndex + 1}`;
      renderLayers();
      draw();
      return true;
    }

    selectGridCell(cellIndex);

    // 電腦版滑鼠：點住格子內部即可直接拖曳移動該格。
    // 手機版保留「先點選，再用白點/微調」的穩定操作，避免誤拖。
    const isTouchPointer = e.pointerType === "touch" || e.pointerType === "pen";
    if (!isTouchPointer) {
      startDrag(pos, cellIndex, false);
      editorStore.deleteButtonBox = cellIndex;
      renderLayers();
      draw();
    }
    return true;
  }

  return false;
}

function startGridGuideDrag(hit) {
  draggingGridGuide = hit;
  gridGuideMoved = false;
  clearLongPressState(false);
  editorStore.deleteButtonBox = -1;
  editorStore.selected = [];
  editorStore.activeBox = -1;
  editorStore.transformStatus = hit.axis === "vertical" ? "拖曳縱向切割線中" : "拖曳橫向切割線中";
  canvas.classList.add("dragging");
}

function updateGridGuideDrag(pos) {
  if (!draggingGridGuide || !editorStore.gridTemplate?.active || !editorStore.image) return;
  const template = editorStore.gridTemplate;
  const padding = 18 / (editorStore.zoom || 1);
  if (draggingGridGuide.axis === "vertical") {
    const lines = template.verticalLines;
    const prev = draggingGridGuide.index === 0 ? 0 : lines[draggingGridGuide.index - 1];
    const next = draggingGridGuide.index === lines.length - 1 ? editorStore.image.width : lines[draggingGridGuide.index + 1];
    lines[draggingGridGuide.index] = clamp(pos.x, prev + padding, next - padding);
  } else {
    const lines = template.horizontalLines;
    const prev = draggingGridGuide.index === 0 ? 0 : lines[draggingGridGuide.index - 1];
    const next = draggingGridGuide.index === lines.length - 1 ? editorStore.image.height : lines[draggingGridGuide.index + 1];
    lines[draggingGridGuide.index] = clamp(pos.y, prev + padding, next - padding);
  }
  gridGuideMoved = true;
  syncBoxesFromGridTemplate(draggingGridGuide.axis === "vertical" ? "已拖曳縱向切割線" : "已拖曳橫向切割線");
}

function getDeleteButtonRect(box) {
  const center = getBoxCenter(box);
  const corner = rotatePoint({ x: box.x, y: box.y }, center, box.rotation || 0);
  const size = 24 / (editorStore.zoom || 1);
  const offset = 10 / (editorStore.zoom || 1);

  return {
    centerX: corner.x - offset,
    centerY: corner.y - offset,
    size
  };
}

function drawDeleteButton(box, index) {
  const shouldShowDelete = editorStore.deleteButtonBox === index || editorStore.selected.includes(index);
  if (!shouldShowDelete) return;
  const button = getDeleteButtonRect(box);
  const radius = button.size / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(button.centerX, button.centerY, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#ef4444";
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2 / (editorStore.zoom || 1);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${14 / (editorStore.zoom || 1)}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✕", button.centerX, button.centerY + 0.5 / (editorStore.zoom || 1));
  ctx.restore();
}

function shouldHighlightDeleteTarget(index) {
  return (
    editorStore.deleteButtonBox === index &&
    editorStore.deleteButtonHighlightUntil &&
    Date.now() < editorStore.deleteButtonHighlightUntil
  );
}

function triggerLongPressFeedback(index) {
  editorStore.deleteButtonHighlightUntil = Date.now() + 900;

  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(80);
    } catch (error) {
      // 某些瀏覽器或系統設定會禁止震動，忽略即可。
    }
  }

  window.setTimeout(() => {
    if (editorStore.deleteButtonBox === index) draw();
  }, 920);
}

function drawRotatedRect(box, selected, hover, index) {
  const center = getBoxCenter(box);

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(box.rotation || 0);
  ctx.translate(-center.x, -center.y);

  ctx.globalAlpha = box.opacity ?? 1;

  if (shouldHighlightDeleteTarget(index)) {
    ctx.save();
    ctx.shadowColor = "rgba(239, 68, 68, 0.95)";
    ctx.shadowBlur = 24 / (editorStore.zoom || 1);
    ctx.fillStyle = "rgba(239, 68, 68, 0.18)";
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 8 / (editorStore.zoom || 1);
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.restore();
  }

  ctx.strokeStyle = selected ? "#00ffff" : hover ? "#ffff00" : "#00ff88";
  ctx.lineWidth = (selected ? 4 : 2) / (editorStore.zoom || 1);
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  if (selected) {
    ctx.fillStyle = "rgba(0,255,255,0.12)";
    ctx.fillRect(box.x, box.y, box.width, box.height);
  }

  if (
    editorStore.selecting &&
    editorStore.selectionRect &&
    boxTouchSelection(box, editorStore.selectionRect)
  ) {
    ctx.fillStyle = "rgba(0,180,255,0.18)";
    ctx.fillRect(box.x, box.y, box.width, box.height);
  }

  ctx.restore();
  ctx.globalAlpha = 1;
  drawDeleteButton(box, index);
}

function drawBoxEdges(points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.stroke();
}

function drawTransformUi(bounds, rotation = 0) {
  if (!bounds) return;

  ctx.save();
  ctx.strokeStyle = "#00ffff";
  ctx.lineWidth = 1 / (editorStore.zoom || 1);
  ctx.setLineDash([6 / (editorStore.zoom || 1)]);
  ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.setLineDash([]);

  const topCenter = { x: bounds.x + bounds.width / 2, y: bounds.y };
  const rotateHandle = { x: topCenter.x, y: topCenter.y - 42 };
  ctx.beginPath();
  ctx.moveTo(topCenter.x, topCenter.y);
  ctx.lineTo(rotateHandle.x, rotateHandle.y);
  ctx.stroke();
  ctx.restore();

  getHandles({ ...bounds, rotation }, { rotation, rotate: true }).forEach(drawHandle);

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `${12 / (editorStore.zoom || 1)}px Arial`;
  const label = editorStore.transformStatus || "Transform";
  ctx.fillText(label, bounds.x, bounds.y - 54 / (editorStore.zoom || 1));
  ctx.restore();
}

export function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawViewportBackground();

  ctx.save();
  ctx.setTransform(
    editorStore.zoom,
    0,
    0,
    editorStore.zoom,
    editorStore.panX,
    editorStore.panY
  );

  if (editorStore.image) {
    drawImageBackdrop();
    ctx.drawImage(editorStore.image, 0, 0);
  }

  drawGridTemplateGuides();

  const isGridTemplateActive = !!editorStore.gridTemplate?.active;

  editorStore.boxes.forEach((box, index) => {
    if (box.visible === false) return;

    const selected = editorStore.selected.includes(index);
    const hover = editorStore.hoverBox === index;

    // 宮格模板啟用時只顯示「已選取格」，避免未選取格線重疊造成點選困難。
    if (isGridTemplateActive && !selected) return;

    drawRotatedRect(box, selected, isGridTemplateActive ? false : hover, index);

    if (selected && editorStore.selected.length === 1) {
      ctx.strokeStyle = "#00ffff";
      ctx.lineWidth = 1 / (editorStore.zoom || 1);
      drawBoxEdges(getBoxCorners(box));
      getHandles(box, { rotate: true }).forEach(drawHandle);
    }
  });

  if (editorStore.selected.length > 1) {
    const selectedBoxes = getSelectedBoxes();
    const bounds = getBounds(selectedBoxes);
    editorStore.transformBounds = bounds;
    drawTransformUi(bounds);
  }

  if (editorStore.selecting && editorStore.selectionRect) {
    const nr = normalizeRect(editorStore.selectionRect);
    ctx.strokeStyle = "#00b4ff";
    ctx.lineWidth = 2 / (editorStore.zoom || 1);
    ctx.setLineDash([8 / (editorStore.zoom || 1)]);
    ctx.fillStyle = "rgba(0,180,255,0.08)";
    ctx.fillRect(nr.x, nr.y, nr.width, nr.height);
    ctx.strokeRect(nr.x, nr.y, nr.width, nr.height);
    ctx.setLineDash([]);
  }

  editorStore.guides.forEach((g) => {
    ctx.strokeStyle = "#00ffff";
    ctx.lineWidth = 1 / (editorStore.zoom || 1);
    if (g.type === "v") {
      ctx.beginPath();
      ctx.moveTo(g.x, -editorStore.panY / editorStore.zoom);
      ctx.lineTo(g.x, (canvas.height - editorStore.panY) / editorStore.zoom);
      ctx.stroke();
    }
    if (g.type === "h") {
      ctx.beginPath();
      ctx.moveTo(-editorStore.panX / editorStore.zoom, g.y);
      ctx.lineTo((canvas.width - editorStore.panX) / editorStore.zoom, g.y);
      ctx.stroke();
    }
  });

  ctx.restore();
  drawZoomHud();
  drawGridEditHint();
}


function drawGridEditHint() {
  if (!editorStore.gridTemplate?.active) return;
  ctx.save();
  ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
  ctx.fillRect(12, 52, 260, 46);
  ctx.fillStyle = "#e0f2fe";
  ctx.font = "12px Arial";
  ctx.fillText("宮格模式：點/拖格子可選取移動；拖青色線調整欄列", 22, 72);
  ctx.fillText("選取格會顯示白點與 ❌，未選格不畫框", 22, 90);
  ctx.restore();
}

function drawViewportBackground() {
  ctx.save();
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(148,163,184,0.18)";
  ctx.lineWidth = 1;
  ctx.setLineDash([8]);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();
  ctx.restore();
}

function drawImageBackdrop() {
  const img = editorStore.image;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(0, 0, img.width, img.height);
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 1 / (editorStore.zoom || 1);
  ctx.strokeRect(0, 0, img.width, img.height);
  ctx.restore();
}

function drawZoomHud() {
  ctx.save();
  ctx.fillStyle = "rgba(15,23,42,0.75)";
  ctx.fillRect(12, 12, 154, 34);
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "13px Arial";
  const mode = editorStore.viewPanMode ? "｜拖動畫布模式" : "";
  ctx.fillText(`縮放 ${Math.round((editorStore.zoom || 1) * 100)}% ${mode}`, 24, 34);
  ctx.restore();
}

function getSelectedBoxes() {
  return editorStore.selected
    .map((i) => editorStore.boxes[i])
    .filter(Boolean)
    .filter((box) => box.visible !== false);
}

function getCanvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function screenToWorld(point) {
  return {
    x: (point.x - editorStore.panX) / editorStore.zoom,
    y: (point.y - editorStore.panY) / editorStore.zoom
  };
}

function getPos(e) {
  return screenToWorld(getCanvasPoint(e));
}

function isMultiSelectKey(e) {
  return !!(e.shiftKey || e.ctrlKey || e.metaKey || editorStore.mobileMultiSelectMode);
}

function toggleBoxSelection(index) {
  if (editorStore.selected.includes(index)) {
    editorStore.selected = editorStore.selected.filter((i) => i !== index);
  } else {
    editorStore.selected = [...editorStore.selected, index];
  }
  editorStore.transformStatus = editorStore.selected.length
    ? `多選 ${editorStore.selected.length} 個裁切框`
    : "多選模式：尚未選取";
  renderLayers();
  draw();
}

function isPointInDeleteButton(pos, box, index = editorStore.boxes.indexOf(box)) {
  const shouldShowDelete = editorStore.deleteButtonBox === index || editorStore.selected.includes(index);
  if (!shouldShowDelete) return false;
  const button = getDeleteButtonRect(box);
  const half = button.size / 2;
  return (
    pos.x >= button.centerX - half &&
    pos.x <= button.centerX + half &&
    pos.y >= button.centerY - half &&
    pos.y <= button.centerY + half
  );
}

function clearLongPressState(keepVisibleDeleteButton = false) {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  longPressPointerId = null;
  longPressTargetIndex = -1;
  longPressStartScreen = null;
  longPressTriggered = false;
  if (!keepVisibleDeleteButton) {
    editorStore.deleteButtonBox = -1;
    editorStore.deleteButtonHighlightUntil = 0;
  }
}

function startLongPressForDelete(pointerId, index, screenPoint) {
  clearLongPressState(false);
  longPressPointerId = pointerId;
  longPressTargetIndex = index;
  longPressStartScreen = screenPoint;
  longPressTriggered = false;
  longPressTimer = window.setTimeout(() => {
    longPressTimer = null;
    longPressTriggered = true;
    editorStore.deleteButtonBox = index;
    triggerLongPressFeedback(index);
    editorStore.transformStatus = "長按成功：已顯示 ❌ 刪除鈕";
    renderLayers();
    draw();
  }, LONG_PRESS_MS);
}

function consumePendingLongPress(pointerId, keepVisibleDeleteButton = false) {
  if (longPressPointerId !== pointerId) return { hadPending: false, triggered: false, targetIndex: -1 };
  const result = {
    hadPending: true,
    triggered: longPressTriggered,
    targetIndex: longPressTargetIndex
  };
  clearLongPressState(keepVisibleDeleteButton && longPressTriggered);
  return result;
}

export function deleteBoxAt(index) {
  if (index < 0 || index >= editorStore.boxes.length) return;

  if (editorStore.historyIndex < 0) {
    saveHistory();
  }

  editorStore.boxes.splice(index, 1);
  renumberDefaultCropNames();
  editorStore.selected = editorStore.selected
    .filter((i) => i !== index)
    .map((i) => (i > index ? i - 1 : i));

  if (editorStore.activeBox === index) editorStore.activeBox = -1;
  else if (editorStore.activeBox > index) editorStore.activeBox -= 1;

  editorStore.deleteButtonBox = -1;
  editorStore.deleteButtonHighlightUntil = 0;
  deactivateGridTemplate(true);
  editorStore.transformStatus = "已刪除裁切框";
  resetCanvasInteraction(true);
  saveHistory();
  renderLayers();
  draw();
}

export function deleteSelectedBoxes() {
  if (!editorStore.selected.length) return;

  if (editorStore.historyIndex < 0) {
    saveHistory();
  }

  const selectedSet = new Set(editorStore.selected);
  editorStore.boxes = editorStore.boxes.filter((_, index) => !selectedSet.has(index));
  renumberDefaultCropNames();
  editorStore.selected = [];
  editorStore.activeBox = -1;
  editorStore.deleteButtonBox = -1;
  editorStore.deleteButtonHighlightUntil = 0;
  deactivateGridTemplate(true);
  editorStore.transformStatus = "已刪除選取裁切框";
  resetCanvasInteraction(true);
  saveHistory();
  renderLayers();
  draw();
}

function pointInRect(pos, rect) {
  return !!(
    rect &&
    pos.x >= rect.x &&
    pos.x <= rect.x + rect.width &&
    pos.y >= rect.y &&
    pos.y <= rect.y + rect.height
  );
}

function isPointOnEditableTarget(pos) {
  if (editorStore.gridTemplate?.active) {
    if (hitGridTemplateGuide(pos)) return true;
    return getGridCellIndexAt(pos) >= 0;
  }

  if (editorStore.selected.length > 1) {
    const bounds = getBounds(getSelectedBoxes());
    if (bounds) {
      if (hitTransformHandles(pos, bounds)) return true;
      if (pointInRect(pos, bounds)) return true;
    }
  }

  for (let index = editorStore.boxes.length - 1; index >= 0; index--) {
    const box = editorStore.boxes[index];
    if (!box || box.visible === false || box.locked) continue;
    if (isPointInDeleteButton(pos, box)) return true;
    if (hitTransformHandles(pos, box)) return true;
    if (pointInBox(pos.x, pos.y, box)) return true;
  }

  return false;
}

function setZoomAt(newZoom, screenPoint) {
  const oldZoom = editorStore.zoom || 1;
  const nextZoom = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
  const before = {
    x: (screenPoint.x - editorStore.panX) / oldZoom,
    y: (screenPoint.y - editorStore.panY) / oldZoom
  };

  editorStore.zoom = nextZoom;
  editorStore.panX = screenPoint.x - before.x * nextZoom;
  editorStore.panY = screenPoint.y - before.y * nextZoom;
}

export function zoomIn() {
  setZoomAt((editorStore.zoom || 1) * 1.25, { x: canvas.width / 2, y: canvas.height / 2 });
  draw();
}

export function zoomOut() {
  setZoomAt((editorStore.zoom || 1) / 1.25, { x: canvas.width / 2, y: canvas.height / 2 });
  draw();
}

export function resetView() {
  editorStore.zoom = 1;
  editorStore.panX = 0;
  editorStore.panY = 0;
  editorStore.viewInitialized = true;
  draw();
}

export function setPanMode(enabled) {
  editorStore.viewPanMode = !!enabled;
  document.body.classList.toggle("pan-mode", editorStore.viewPanMode);
  draw();
}

export function togglePanMode() {
  setPanMode(!editorStore.viewPanMode);
  return editorStore.viewPanMode;
}

export function fitImageToView(redraw = true) {
  if (!editorStore.image) return;

  const availableW = Math.max(100, canvas.width - FIT_PADDING * 2);
  const availableH = Math.max(100, canvas.height - FIT_PADDING * 2);
  const zoom = clamp(
    Math.min(availableW / editorStore.image.width, availableH / editorStore.image.height),
    MIN_ZOOM,
    MAX_ZOOM
  );

  editorStore.zoom = zoom;
  editorStore.panX = (canvas.width - editorStore.image.width * zoom) / 2;
  editorStore.panY = (canvas.height - editorStore.image.height * zoom) / 2;
  editorStore.viewInitialized = true;
  if (redraw) draw();
}

export function setImageAndFit(img) {
  editorStore.image = img;
  editorStore.viewInitialized = false;
  editorStore.gridTemplate = createEmptyGridTemplate();
  fitImageToView();
}

function beginPinch() {
  const points = [...activePointers.values()];
  if (points.length < 2) return;

  resetCanvasInteraction(false);
  const a = points[0];
  const b = points[1];
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

  pinchState = {
    distance: Math.hypot(b.x - a.x, b.y - a.y) || 1,
    center,
    zoom: editorStore.zoom || 1,
    panX: editorStore.panX || 0,
    panY: editorStore.panY || 0
  };
  pinching = true;
  canvas.classList.add("dragging");
}

function updatePinch() {
  const points = [...activePointers.values()];
  if (!pinchState || points.length < 2) return;

  const a = points[0];
  const b = points[1];
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nextZoom = clamp(pinchState.zoom * (distance / pinchState.distance), MIN_ZOOM, MAX_ZOOM);

  const worldAtStartCenter = {
    x: (pinchState.center.x - pinchState.panX) / pinchState.zoom,
    y: (pinchState.center.y - pinchState.panY) / pinchState.zoom
  };

  editorStore.zoom = nextZoom;
  editorStore.panX = center.x - worldAtStartCenter.x * nextZoom;
  editorStore.panY = center.y - worldAtStartCenter.y * nextZoom;
  draw();
}

export function resetCanvasInteraction(keepSelection = true) {
  clearLongPressState(false);
  editorStore.dragging = false;
  panningView = false;
  panStartPoint = null;
  resizing = false;
  groupResizing = false;
  rotating = false;
  editorStore.resizeHandle = null;
  editorStore.selecting = false;
  editorStore.selectionRect = null;
  editorStore.guides = [];
  editorStore.transformStatus = keepSelection ? editorStore.transformStatus : "雙指縮放／拖動畫布";
  groupResizeStartBounds = null;
  groupResizeStartBoxes = [];
  groupRotateCenter = null;
  draggingGridGuide = null;
  gridGuideMoved = false;
}

function angleFromCenter(pos, center) {
  return Math.atan2(pos.y - center.y, pos.x - center.x);
}

function snapshotSelected() {
  return editorStore.selected.map((index) => {
    const box = editorStore.boxes[index];
    return {
      index,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      rotation: box.rotation || 0,
      locked: box.locked
    };
  });
}

function startGroupResize(pos, handleName) {
  saveHistory();
  if (!editorStore.gridTemplate?.active) editorStore.deleteButtonBox = -1;
  if (!editorStore.gridTemplate?.active) deactivateGridTemplate(true);
  groupResizing = true;
  editorStore.resizeHandle = handleName;
  groupResizeStartBounds = getBounds(getSelectedBoxes());
  groupResizeStartBoxes = snapshotSelected();
  resizeStartX = pos.x;
  resizeStartY = pos.y;
  editorStore.transformStatus = "群組縮放：Shift 鎖比例、Alt 由中心縮放";
  canvas.classList.add("dragging");
}

function startSingleResize(pos, index, handleName) {
  saveHistory();
  if (!editorStore.gridTemplate?.active) editorStore.deleteButtonBox = -1;
  if (!editorStore.gridTemplate?.active) deactivateGridTemplate(true);
  const box = editorStore.boxes[index];
  editorStore.activeBox = index;
  editorStore.resizeHandle = handleName;
  resizing = true;
  resizeStartX = pos.x;
  resizeStartY = pos.y;
  resizeStartBoxX = box.x;
  resizeStartBoxY = box.y;
  resizeStartWidth = box.width;
  resizeStartHeight = box.height;
  resizeStartRotation = box.rotation || 0;
  editorStore.selected = [index];
  editorStore.transformStatus = "縮放：Shift 鎖比例、Alt 由中心縮放";
  canvas.classList.add("dragging");
}

function startRotate(pos, index = null) {
  saveHistory();
  if (!editorStore.gridTemplate?.active) editorStore.deleteButtonBox = -1;
  if (!editorStore.gridTemplate?.active) deactivateGridTemplate(true);
  rotating = true;

  if (index !== null) {
    editorStore.activeBox = index;
    const box = editorStore.boxes[index];
    const center = getBoxCenter(box);
    groupRotateCenter = center;
    resizeStartRotation = box.rotation || 0;
    groupRotateStartAngle = angleFromCenter(pos, center);
    groupResizeStartBoxes = snapshotSelected();
  } else {
    groupResizeStartBounds = getBounds(getSelectedBoxes());
    groupRotateCenter = {
      x: groupResizeStartBounds.centerX,
      y: groupResizeStartBounds.centerY
    };
    groupRotateStartAngle = angleFromCenter(pos, groupRotateCenter);
    groupResizeStartBoxes = snapshotSelected();
  }

  editorStore.transformStatus = "旋轉：Shift 每 15° 吸附";
  canvas.classList.add("dragging");
}

function startDrag(pos, index, keepSelection) {
  saveHistory();
  editorStore.deleteButtonBox = -1;
  const box = editorStore.boxes[index];
  editorStore.activeBox = index;
  editorStore.dragging = true;
  dragOffsetX = pos.x - box.x;
  dragOffsetY = pos.y - box.y;

  if (keepSelection) {
    if (!editorStore.selected.includes(index)) editorStore.selected.push(index);
  } else if (!editorStore.selected.includes(index)) {
    editorStore.selected = [index];
  }

  editorStore.transformStatus = "移動：靠近邊線／中心會自動吸附";
  canvas.classList.add("dragging");
}

function hitTransformHandles(pos, target) {
  for (const h of getHandles(target, { rotate: true })) {
    if (hitHandle(pos.x, pos.y, h, (h.isRotate ? 14 : 12) / (editorStore.zoom || 1))) return h;
  }
  return null;
}

export function rotateSelectedByDegrees(degrees = 15) {
  const targets = editorStore.selected?.length
    ? [...editorStore.selected]
    : (Number.isInteger(editorStore.activeBox) && editorStore.activeBox >= 0 ? [editorStore.activeBox] : []);

  const delta = (Number(degrees) || 0) * Math.PI / 180;
  if (!targets.length) {
    alert("請先選取至少一個裁切框");
    return;
  }

  saveHistory();
  let changed = 0;
  targets.forEach((index) => {
    const box = editorStore.boxes[index];
    if (!box || box.locked) return;
    box.rotation = normalizeAngle((box.rotation || 0) + delta);
    changed += 1;
  });

  if (!changed) {
    editorStore.transformStatus = "目前選取的裁切框已鎖定，無法旋轉";
  } else {
    editorStore.transformStatus = `已旋轉 ${changed} 個裁切框 ${degrees > 0 ? '順時針' : '逆時針'} ${Math.abs(Number(degrees) || 0)}°`;
  }

  renderLayers();
  draw();
}

export function resetSelectedRotation() {
  const targets = editorStore.selected?.length
    ? [...editorStore.selected]
    : (Number.isInteger(editorStore.activeBox) && editorStore.activeBox >= 0 ? [editorStore.activeBox] : []);

  if (!targets.length) {
    alert("請先選取至少一個裁切框");
    return;
  }

  saveHistory();
  let changed = 0;
  targets.forEach((index) => {
    const box = editorStore.boxes[index];
    if (!box || box.locked) return;
    box.rotation = 0;
    changed += 1;
  });

  editorStore.transformStatus = changed ? `已將 ${changed} 個裁切框旋轉角度重設為 0°` : "目前選取的裁切框已鎖定，無法重設旋轉";
  renderLayers();
  draw();
}

function onWheel(e) {
  e.preventDefault();
  const point = getCanvasPoint(e);
  const direction = e.deltaY > 0 ? 1 / 1.12 : 1.12;
  setZoomAt((editorStore.zoom || 1) * direction, point);
  draw();
}

function startViewPan(screenPoint) {
  clearLongPressState(false);
  panningView = true;
  panStartPoint = screenPoint;
  panStartX = editorStore.panX || 0;
  panStartY = editorStore.panY || 0;
  editorStore.transformStatus = "拖動畫布中";
  canvas.classList.add("dragging");
}

function updateViewPan(screenPoint) {
  if (!panningView || !panStartPoint) return;
  editorStore.panX = panStartX + (screenPoint.x - panStartPoint.x);
  editorStore.panY = panStartY + (screenPoint.y - panStartPoint.y);
  draw();
}

function getBestMultiSelectIndexAt(pos) {
  const hits = [];
  for (let index = 0; index < editorStore.boxes.length; index += 1) {
    const box = editorStore.boxes[index];
    if (!box || box.visible === false || box.locked) continue;
    if (!pointInBox(pos.x, pos.y, box)) continue;
    const center = getBoxCenter(box);
    const area = Math.max(1, box.width * box.height);
    const distance = Math.hypot(pos.x - center.x, pos.y - center.y);
    hits.push({ index, area, distance });
  }

  if (!hits.length) return -1;
  // 多選時若裁切框互相重疊，優先選「面積較小且中心較近」的 Crop，避免大框蓋住小框。
  hits.sort((a, b) => (a.area - b.area) || (a.distance - b.distance) || (b.index - a.index));
  return hits[0].index;
}

function handleGlobalMultiSelectHit(pos) {
  if (!editorStore.mobileMultiSelectMode) return false;

  const index = getBestMultiSelectIndexAt(pos);
  if (index < 0) return false;

  // v46: 已經多選 2 個以上時，點在已選 Crop 上要保留給「群組移動/縮放」，不能再切換選取。
  // 點未選 Crop 才加入多選；點已選 Crop 的群組框或白點可一起移動/縮放。
  if (editorStore.selected.length > 1 && editorStore.selected.includes(index)) {
    return false;
  }

  editorStore.deleteButtonBox = -1;
  toggleBoxSelection(index);
  editorStore.activeBox = editorStore.selected[0] ?? -1;
  editorStore.transformStatus = editorStore.selected.includes(index)
    ? `多選已加入 Crop ${index + 1}，目前共 ${editorStore.selected.length} 個`
    : `多選已移除 Crop ${index + 1}，目前共 ${editorStore.selected.length} 個`;
  renderLayers();
  draw();
  return true;
}

function onPointerDown(e) {
  const screenPoint = getCanvasPoint(e);
  const pos = screenToWorld(screenPoint);
  const isTouch = e.pointerType === "touch" || e.pointerType === "pen";

  // 先記錄觸控點，避免第一指點在空白處時被忽略，造成第二指無法啟動雙指縮放。
  activePointers.set(e.pointerId, screenPoint);

  if (activePointers.size >= 2) {
    clearLongPressState(false);
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    beginPinch();
    draw();
    return;
  }

  // 手機在畫布空白處滑動時，讓瀏覽器可以上下捲動到上方功能區。
  // 若點到裁切框、控制點、開啟拖動畫布或多選模式，才攔截觸控事件進行編輯。
  if (isTouch && !editorStore.gridTemplate?.active && !editorStore.viewPanMode && !editorStore.mobileMultiSelectMode && !isPointOnEditableTarget(pos)) {
    return;
  }

  e.preventDefault();
  canvas.setPointerCapture?.(e.pointerId);

  if (editorStore.viewPanMode) {
    startViewPan(screenPoint);
    draw();
    return;
  }

  if (editorStore.gridTemplate?.active) {
    const gridGuideHit = hitGridTemplateGuide(pos);
    if (gridGuideHit) {
      startGridGuideDrag(gridGuideHit);
      renderLayers();
      draw();
      return;
    }
  }

  // 多選模式下，不先進入群組拖曳/縮放判斷，避免有些 Crop 因為在群組外框內而無法被加入多選。
  if (handleGlobalMultiSelectHit(pos)) return;

  if (editorStore.gridTemplate?.active) {
    if (handleGridTemplatePointerDown(e, pos)) return;
  }

  editorStore.activeBox = -1;

  if (editorStore.selected.length > 1) {
    const bounds = getBounds(getSelectedBoxes());

    if (bounds) {
      const handle = hitTransformHandles(pos, bounds);
      if (handle) {
        if (handle.name === "rotate") startRotate(pos, null);
        else startGroupResize(pos, handle.name);
        renderLayers();
        draw();
        return;
      }

      if (pointInRect(pos, bounds)) {
        const firstSelected = editorStore.selected.find(
          (i) => editorStore.boxes[i] && editorStore.boxes[i].locked !== true
        );
        if (firstSelected !== undefined) {
          startDrag(pos, firstSelected, true);
          renderLayers();
          draw();
          return;
        }
      }
    }
  }

  for (let index = editorStore.boxes.length - 1; index >= 0; index--) {
    const box = editorStore.boxes[index];
    if (box.visible === false || box.locked) continue;

    if (editorStore.mobileMultiSelectMode && pointInBox(pos.x, pos.y, box)) {
      editorStore.deleteButtonBox = -1;
      toggleBoxSelection(index);
      editorStore.activeBox = editorStore.selected[0] ?? -1;
      editorStore.transformStatus = editorStore.selected.includes(index)
        ? `多選已加入 Crop ${index + 1}`
        : `多選已移除 Crop ${index + 1}`;
      renderLayers();
      draw();
      return;
    }

    if (isPointInDeleteButton(pos, box)) {
      deleteBoxAt(index);
      return;
    }

    const handle = hitTransformHandles(pos, box);
    if (handle) {
      if (handle.name === "rotate") startRotate(pos, index);
      else startSingleResize(pos, index, handle.name);
      renderLayers();
      draw();
      return;
    }

    if (pointInBox(pos.x, pos.y, box)) {
      if (editorStore.mobileMultiSelectMode) {
        editorStore.deleteButtonBox = -1;
        toggleBoxSelection(index);
        editorStore.transformStatus = editorStore.selected.includes(index) ? "已加入多選" : "已從多選移除";
        return;
      }

      if (!editorStore.selected.includes(index)) {
        editorStore.selected = [index];
      } else if (!isMultiSelectKey(e) && editorStore.selected.length === 1) {
        editorStore.selected = [index];
      }
      editorStore.activeBox = index;

      if (!isTouch) {
        // 電腦版：滑鼠點住裁切框內部立即進入拖曳移動，並顯示左上角 ❌。
        startDrag(pos, index, isMultiSelectKey(e));
        editorStore.deleteButtonBox = index;
        editorStore.transformStatus = "拖曳滑鼠可移動裁切框";
      } else {
        editorStore.transformStatus = "長按可顯示 ❌，拖曳可移動裁切框";
        startLongPressForDelete(e.pointerId, index, screenPoint);
      }

      renderLayers();
      draw();
      return;
    }
  }

  editorStore.deleteButtonBox = -1;
  editorStore.selecting = true;
  editorStore.selectionRect = { x: pos.x, y: pos.y, width: 0, height: 0 };
  if (!isMultiSelectKey(e)) editorStore.selected = [];
  renderLayers();
  draw();
}

function onPointerMove(e) {
  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, getCanvasPoint(e));
  }

  if (pinching) {
    updatePinch();
    return;
  }

  if (panningView) {
    updateViewPan(getCanvasPoint(e));
    return;
  }

  const pos = getPos(e);

  if (draggingGridGuide) {
    updateGridGuideDrag(pos);
    draw();
    return;
  }

  if (longPressPointerId === e.pointerId && longPressTargetIndex >= 0 && longPressStartScreen) {
    const currentScreen = getCanvasPoint(e);
    const moved = Math.hypot(
      currentScreen.x - longPressStartScreen.x,
      currentScreen.y - longPressStartScreen.y
    );

    if (!longPressTriggered && moved > DRAG_START_THRESHOLD) {
      const pendingIndex = longPressTargetIndex;
      clearLongPressState(false);
      startDrag(pos, pendingIndex, isMultiSelectKey(e));
      renderLayers();
      draw();
      return;
    }

    if (longPressTriggered) {
      draw();
      return;
    }
  }

  editorStore.hoverBox = -1;

  if (!editorStore.gridTemplate?.active) {
    editorStore.boxes.forEach((box, index) => {
      if (box.visible === false) return;
      if (pointInBox(pos.x, pos.y, box)) editorStore.hoverBox = index;
    });
  }

  if (editorStore.selecting && editorStore.selectionRect) {
    editorStore.selectionRect.width = pos.x - editorStore.selectionRect.x;
    editorStore.selectionRect.height = pos.y - editorStore.selectionRect.y;
    draw();
    return;
  }

  if (rotating) {
    rotateSelected(pos, e);
    draw();
    return;
  }

  if (groupResizing) {
    resizeSelectedGroup(pos, e);
    draw();
    return;
  }

  if (resizing) {
    resizeSingleBox(pos, e);
    draw();
    return;
  }

  if (editorStore.dragging) {
    dragSelectedBoxes(pos);
    draw();
    return;
  }

  editorStore.guides = [];
  draw();
}

function getResizeRectFromHandle(start, handle, pos, e) {
  const startRight = start.x + start.width;
  const startBottom = start.y + start.height;

  let fixedX = handle.includes("w") ? startRight : start.x;
  let fixedY = handle.includes("n") ? startBottom : start.y;
  let movingX = handle.includes("w") || handle.includes("e") ? pos.x : startRight;
  let movingY = handle.includes("n") || handle.includes("s") ? pos.y : startBottom;

  if (e.altKey) {
    const centerX = start.x + start.width / 2;
    const centerY = start.y + start.height / 2;
    if (handle.includes("w") || handle.includes("e")) {
      const half = Math.max(MIN_GROUP_SIZE / 2, Math.abs(pos.x - centerX));
      fixedX = centerX - half;
      movingX = centerX + half;
    }
    if (handle.includes("n") || handle.includes("s")) {
      const half = Math.max(MIN_GROUP_SIZE / 2, Math.abs(pos.y - centerY));
      fixedY = centerY - half;
      movingY = centerY + half;
    }
  }

  let newLeft = Math.min(fixedX, movingX);
  let newRight = Math.max(fixedX, movingX);
  let newTop = Math.min(fixedY, movingY);
  let newBottom = Math.max(fixedY, movingY);

  if (!handle.includes("w") && !handle.includes("e")) {
    newLeft = start.x;
    newRight = startRight;
  }
  if (!handle.includes("n") && !handle.includes("s")) {
    newTop = start.y;
    newBottom = startBottom;
  }

  if (newRight - newLeft < MIN_GROUP_SIZE) newRight = newLeft + MIN_GROUP_SIZE;
  if (newBottom - newTop < MIN_GROUP_SIZE) newBottom = newTop + MIN_GROUP_SIZE;

  if (e.shiftKey) {
    const aspect = start.width / Math.max(1, start.height);
    const currentW = newRight - newLeft;
    const currentH = newBottom - newTop;

    if (handle === "n" || handle === "s") {
      const w = currentH * aspect;
      const cx = (newLeft + newRight) / 2;
      newLeft = cx - w / 2;
      newRight = cx + w / 2;
    } else {
      const h = currentW / aspect;
      if (handle.includes("n") && !e.altKey) newTop = newBottom - h;
      else if (handle.includes("s") && !e.altKey) newBottom = newTop + h;
      else {
        const cy = (newTop + newBottom) / 2;
        newTop = cy - h / 2;
        newBottom = cy + h / 2;
      }
    }
  }

  return {
    x: newLeft,
    y: newTop,
    width: newRight - newLeft,
    height: newBottom - newTop,
    right: newRight,
    bottom: newBottom,
    centerX: newLeft + (newRight - newLeft) / 2,
    centerY: newTop + (newBottom - newTop) / 2
  };
}

function resizeSingleBox(pos, e) {
  const box = editorStore.boxes[editorStore.activeBox];
  if (!box) return;

  const start = {
    x: resizeStartBoxX,
    y: resizeStartBoxY,
    width: resizeStartWidth,
    height: resizeStartHeight
  };
  const handle = editorStore.resizeHandle || "";
  const rect = getResizeRectFromHandle(start, handle, pos, e);

  box.x = rect.x;
  box.y = rect.y;
  box.width = Math.max(MIN_BOX_SIZE, rect.width);
  box.height = Math.max(MIN_BOX_SIZE, rect.height);
  box.rotation = resizeStartRotation;

  snapResizedSelection();
}

function resizeSelectedGroup(pos, e) {
  if (!groupResizeStartBounds) return;

  const handle = editorStore.resizeHandle || "";
  const start = groupResizeStartBounds;
  const rect = getResizeRectFromHandle(start, handle, pos, e);

  const baseWidth = start.width || 1;
  const baseHeight = start.height || 1;

  groupResizeStartBoxes.forEach((snapshot) => {
    const box = editorStore.boxes[snapshot.index];
    if (!box || snapshot.locked) return;

    const relCenterX = (snapshot.x + snapshot.width / 2 - start.x) / baseWidth;
    const relCenterY = (snapshot.y + snapshot.height / 2 - start.y) / baseHeight;
    const relW = snapshot.width / baseWidth;
    const relH = snapshot.height / baseHeight;

    const newW = Math.max(MIN_BOX_SIZE, relW * rect.width);
    const newH = Math.max(MIN_BOX_SIZE, relH * rect.height);

    box.x = rect.x + relCenterX * rect.width - newW / 2;
    box.y = rect.y + relCenterY * rect.height - newH / 2;
    box.width = newW;
    box.height = newH;
    box.rotation = snapshot.rotation;
  });

  snapResizedSelection();
}

function rotateSelected(pos, e) {
  if (!groupRotateCenter) return;

  const currentAngle = angleFromCenter(pos, groupRotateCenter);
  let delta = currentAngle - groupRotateStartAngle;

  if (e.shiftKey) {
    const step = Math.PI / 12;
    delta = Math.round(delta / step) * step;
  }

  if (editorStore.selected.length === 1) {
    const box = editorStore.boxes[editorStore.selected[0]];
    const snap = groupResizeStartBoxes[0];
    if (box && snap && !snap.locked) box.rotation = normalizeAngle(snap.rotation + delta);
    editorStore.transformStatus = `旋轉 ${radiansToDegrees(delta)}°`;
    return;
  }

  groupResizeStartBoxes.forEach((snapshot) => {
    const box = editorStore.boxes[snapshot.index];
    if (!box || snapshot.locked) return;

    const startCenter = {
      x: snapshot.x + snapshot.width / 2,
      y: snapshot.y + snapshot.height / 2
    };
    const newCenter = rotatePoint(startCenter, groupRotateCenter, delta);

    box.x = newCenter.x - snapshot.width / 2;
    box.y = newCenter.y - snapshot.height / 2;
    box.rotation = normalizeAngle(snapshot.rotation + delta);
  });

  editorStore.transformStatus = `群組旋轉 ${radiansToDegrees(delta)}°`;
}

function getSelectedBoundsForSnap() {
  const selectedBoxes = getSelectedBoxes();
  return getBounds(selectedBoxes);
}

function snapResizedSelection() {
  const bounds = getSelectedBoundsForSnap();
  if (!bounds) return;

  const otherBoxes = editorStore.boxes.filter(
    (_, index) => !editorStore.selected.includes(index)
  );
  const guideResult = getGuides(bounds, otherBoxes);
  editorStore.guides = guideResult.guides;

  if (guideResult.snapX !== null || guideResult.snapY !== null) {
    editorStore.selected.forEach((index) => {
      const box = editorStore.boxes[index];
      if (!box || box.locked) return;
      if (guideResult.snapX !== null) box.x += guideResult.snapX;
      if (guideResult.snapY !== null) box.y += guideResult.snapY;
    });
  }
}

function dragSelectedBoxes(pos) {
  const activeBox = editorStore.boxes[editorStore.activeBox];
  if (!activeBox) return;

  const newX = pos.x - dragOffsetX;
  const newY = pos.y - dragOffsetY;
  const deltaX = newX - activeBox.x;
  const deltaY = newY - activeBox.y;

  editorStore.selected.forEach((index) => {
    const box = editorStore.boxes[index];
    if (!box || box.locked) return;
    box.x += deltaX;
    box.y += deltaY;
  });

  const bounds = getSelectedBoundsForSnap() || activeBox;
  const otherBoxes = editorStore.boxes.filter(
    (_, index) => !editorStore.selected.includes(index)
  );
  const guideResult = getGuides(bounds, otherBoxes, {
    canvasWidth: editorStore.image?.width || canvas.width,
    canvasHeight: editorStore.image?.height || canvas.height,
    snapDistance: SNAP_DISTANCE / (editorStore.zoom || 1)
  });

  editorStore.guides = guideResult.guides;

  if (guideResult.snapX !== null || guideResult.snapY !== null) {
    editorStore.selected.forEach((index) => {
      const box = editorStore.boxes[index];
      if (!box || box.locked) return;
      if (guideResult.snapX !== null) box.x += guideResult.snapX;
      if (guideResult.snapY !== null) box.y += guideResult.snapY;
    });
  }
}

function onPointerUp(e) {
  canvas.releasePointerCapture?.(e.pointerId);
  const wasPinching = pinching;
  activePointers.delete(e.pointerId);

  if (wasPinching) {
    if (activePointers.size < 2) {
      pinching = false;
      pinchState = null;
      canvas.classList.remove("dragging");
    }
    draw();
    return;
  }

  const pendingLongPress = consumePendingLongPress(e.pointerId, true);
  if (pendingLongPress.hadPending && !pendingLongPress.triggered) {
    editorStore.transformStatus = "";
    canvas.classList.remove("dragging");
    renderLayers();
    draw();
    return;
  }

  if (editorStore.selecting && editorStore.selectionRect) {
    editorStore.boxes.forEach((box, index) => {
      if (box.visible === false || box.locked) return;

      if (boxTouchSelection(box, editorStore.selectionRect)) {
        if (!editorStore.selected.includes(index)) editorStore.selected.push(index);
      }
    });
  }

  if (editorStore.dragging || resizing || groupResizing || rotating || gridGuideMoved) saveHistory();

  editorStore.dragging = false;
  draggingGridGuide = null;
  gridGuideMoved = false;
  panningView = false;
  panStartPoint = null;
  resizing = false;
  groupResizing = false;
  rotating = false;
  editorStore.resizeHandle = null;
  editorStore.selecting = false;
  editorStore.selectionRect = null;
  editorStore.guides = [];
  editorStore.transformStatus = "";
  groupResizeStartBounds = null;
  groupResizeStartBoxes = [];
  groupRotateCenter = null;

  canvas.classList.remove("dragging");
  renderLayers();
  draw();
}


export function createCropBoxCentered() {
  deactivateGridTemplate(true);
  resetCanvasInteraction(true);
  setPanMode(false);

  // 讓手機版第一次新增裁切框後，也可以按「復原」回到沒有裁切框的狀態。
  if (editorStore.historyIndex < 0) {
    saveHistory();
  }

  const worldCenter = screenToWorld({
    x: canvas.width / 2,
    y: canvas.height / 2
  });

  const imageW = editorStore.image?.width || 800;
  const imageH = editorStore.image?.height || 800;
  const visibleW = canvas.width / Math.max(editorStore.zoom || 1, 0.001);
  const visibleH = canvas.height / Math.max(editorStore.zoom || 1, 0.001);

  const boxSize = Math.max(
    80,
    Math.min(260, imageW * 0.35, imageH * 0.35, visibleW * 0.55, visibleH * 0.55)
  );

  const box = {
    x: clamp(worldCenter.x - boxSize / 2, 0, Math.max(0, imageW - boxSize)),
    y: clamp(worldCenter.y - boxSize / 2, 0, Math.max(0, imageH - boxSize)),
    width: boxSize,
    height: boxSize,
    rotation: 0,
    visible: true,
    locked: false,
    opacity: 1,
    name: `Crop ${editorStore.boxes.length + 1}`
  };

  editorStore.boxes.push(box);
  renumberDefaultCropNames();
  editorStore.selected = [editorStore.boxes.length - 1];
  editorStore.activeBox = editorStore.boxes.length - 1;
  editorStore.transformStatus = "已新增裁切框";
  saveHistory();
  renderLayers();
  draw();
}

export function distributeSelected(direction = "horizontal") {
  const selectedOnly = [...editorStore.selected]
    .map((index) => ({ index, box: editorStore.boxes[index] }))
    .filter((item) => item.box && item.box.visible !== false && item.box.locked !== true);

  const allUnlocked = editorStore.boxes
    .map((box, index) => ({ index, box }))
    .filter((item) => item.box && item.box.visible !== false && item.box.locked !== true);

  // 3 個以上選取框時分布選取項目；未選滿 3 個時，改為分布全部裁切框，手機操作更直覺。
  const selected = selectedOnly.length >= 3 ? selectedOnly : allUnlocked;

  if (selected.length < 3) {
    editorStore.transformStatus = "Smart Distribute 需要至少 3 個裁切框";
    alert("Smart Distribute 需要至少 3 個裁切框。\n如果只選 1～2 個，位置看起來不會有變化。");
    draw();
    return;
  }

  const axis = direction === "vertical" ? "y" : "x";
  const size = direction === "vertical" ? "height" : "width";

  selected.sort((a, b) => a.box[axis] - b.box[axis]);

  const first = selected[0].box;
  const last = selected[selected.length - 1].box;
  const start = first[axis];
  const end = last[axis] + last[size];
  const totalSize = selected.reduce((sum, item) => sum + item.box[size], 0);
  const gap = (end - start - totalSize) / (selected.length - 1);

  let cursor = start;
  selected.forEach((item) => {
    item.box[axis] = cursor;
    cursor += item.box[size] + gap;
  });

  editorStore.selected = selected.map((item) => item.index);
  editorStore.transformStatus = direction === "vertical" ? "已垂直平均分布裁切框" : "已水平平均分布裁切框";
  saveHistory();
  draw();
  renderLayers();
}
