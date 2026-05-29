import { editorStore } from "../store/editorStore.js";
import { autoDetectCropBoxesFromImage } from "../ai/detect.js";
import { createCropBoxCentered, deleteSelectedBoxes, distributeSelected, draw, fitImageToView, replaceBoxes, resetSelectedRotation, resetView, rotateSelectedByDegrees, setEditableGridTemplate, setImageAndFit, setPanMode, togglePanMode, zoomIn, zoomOut } from "../core/canvas.js";
import { snapBoxesToContent } from "../ai/grid-snap.js";
import { EXPORT_PRESETS, exportSelectedPng, exportZip, previewCrop, renderLineExportReport } from "../core/exporter.js";
import { applyReferenceSizeToAll, batchRenameCrops, deleteEmptyCrops, duplicateSelectedCrops, setLockedForTargets, setOpacityForTargets, sortCropsByNumber, toggleSelectAllCrops } from "../core/crop-manager.js";
import { undo, redo, saveHistory } from "../core/history.js";
import { renderLayers } from "./layer-panel.js";

export function initToolbar() {
  const toolbar = document.getElementById("toolbar");

  function getPresetEntries() {
    const fallbackPresets = {
      scale1: { label: "原始裁切 1x" },
      scale2: { label: "原始裁切 2x" },
      scale3: { label: "原始裁切 3x" },
      lineSticker: { label: "LINE貼圖 370×320內" },
      lineStickerMain: { label: "LINE貼圖主圖 240×240" },
      lineStickerTab: { label: "LINE貼圖Tab 96×74" },
      lineEmoji: { label: "LINE表情貼 180×180" },
      lineEmojiTab: { label: "LINE表情貼Tab 96×74" }
    };
    const presets = Object.keys(EXPORT_PRESETS || {}).length >= 8 ? EXPORT_PRESETS : fallbackPresets;
    return Object.entries(presets);
  }

  function renderPresetOptions() {
    return getPresetEntries()
      .map(([key, preset]) => `<option value="${key}">${preset.label}</option>`)
      .join("");
  }

  function renderPresetButtons() {
    return getPresetEntries()
      .map(([key, preset]) => `<button class="preset-choice" type="button" data-preset="${key}">${preset.label}</button>`)
      .join("");
  }

  toolbar.innerHTML = `
  <div class="toolbar-wrap">
    <div class="version-badge">v39 已載入｜批次鎖定 / 解鎖 ＋ 批次透明度</div>

    <div class="quick-history-buttons quick-history-top">
      <button id="undoBtn" type="button">↶ 復原</button>
      <button id="redoBtn" type="button">↷ 重做</button>
    </div>

    <div class="quick-history-buttons mobile-select-top">
      <button id="multiSelectBtn" type="button">多選模式：關</button>
      <button id="selectAllBtn" type="button">全選 / 取消全選</button>
    </div>

    <button id="deleteSelectedBtn" class="danger-button delete-selected-top" type="button">刪除已選裁切框</button>
    <button id="scrollLayersBtn" class="secondary-button scroll-layers-top" type="button">顯示 Layers / 圖層</button>

    <input type="file" id="uploadInput" accept="image/*" />

    <button id="addBoxBtn">新增裁切框</button>
    <button id="autoDetectBtn" class="secondary-button" type="button">自動預測裁切框</button>
    <div class="tool-note auto-detect-note">上傳圖片後會先自動預測裁切框；若預測不準，可直接使用下方 4×4 / 5×8 平均切格，或自行設定縱向／橫向切割線數量。</div>

    <div class="tool-section crop-manage-section">
      <div class="tool-title">Crop 清單管理強化</div>
      <div class="tool-note">支援編號固定排序、批次重新命名、全選/取消全選、刪除空白 Crop、複製 Crop、一鍵套用同尺寸，並新增批次鎖定/解鎖與批次透明度。</div>
      <div class="crop-manage-grid">
        <button id="sortCropsBtn" type="button">Crop 編號固定排序</button>
        <button id="duplicateCropBtn" type="button">一鍵複製 Crop</button>
        <button id="deleteEmptyBtn" class="secondary-button" type="button">一鍵刪除空白 Crop</button>
        <button id="applySizeToAllBtn" class="secondary-button" type="button">套用同尺寸到全部 Crop</button>
        <button id="lockSelectedBtn" type="button">批次鎖定 Crop</button>
        <button id="unlockSelectedBtn" class="secondary-button" type="button">批次解鎖 Crop</button>
      </div>
      <label class="tool-label">批次重新命名前綴（有選取時只改選取 Crop，未選取則改全部）</label>
      <div class="crop-rename-row">
        <input id="batchRenamePrefix" class="text-input" type="text" value="Crop" maxlength="40" placeholder="例如：貼圖" />
        <button id="batchRenameBtn" type="button">批次重新命名</button>
      </div>
      <label class="tool-label">批次調整透明度（有選取時只改選取 Crop，未選取則改全部）</label>
      <div class="crop-opacity-row">
        <input id="batchOpacityRange" type="range" min="0" max="100" value="100" />
        <span id="batchOpacityLabel">100%</span>
        <button id="applyOpacityBtn" type="button">套用透明度</button>
      </div>
      <div id="cropManageNote" class="tool-note"></div>
    </div>

    <div class="tool-section grid-section">
      <div class="tool-title">LINE 宮格模板 / 可拖曳切割線</div>
      <div class="tool-note">一鍵產生 LINE 16 宮格、8 宮格、5×8 或自訂模板；建立後只顯示青色切割線。點某一格才顯示該格裁切框，拖青色線可調整切割線。</div>
      <div class="grid-preset-buttons">
        <button id="gridLine16Btn" type="button">LINE 16 宮格</button>
        <button id="gridLine8Btn" type="button">LINE 8 宮格</button>
        <button id="grid5x8Btn" type="button">5×8 平均切格</button>
        <button id="grid4x4Btn" type="button">4×4 平均切格</button>
      </div>
      <div class="grid-inputs">
        <label class="grid-input-field">
          <span>縱向切割線</span>
          <input id="verticalLinesInput" type="number" min="0" max="20" value="3" inputmode="numeric" />
        </label>
        <label class="grid-input-field">
          <span>橫向切割線</span>
          <input id="horizontalLinesInput" type="number" min="0" max="30" value="3" inputmode="numeric" />
        </label>
      </div>
      <div id="gridResultNote" class="tool-note"></div>
      <button id="generateGridBtn" class="secondary-button" type="button">一鍵產生自訂宮格模板</button>
      <button id="snapGridBtn" class="secondary-button" type="button">先平均切格，再自動吸附圖案邊界</button>
    </div>

    <div class="tool-section nudge-section">
      <div class="tool-title">裁切框微調</div>
      <div class="tool-note">先選取裁切框，再用方向鍵精準移動。可切換 1px / 5px / 10px。</div>
      <div class="nudge-inline-grid">
        <button id="nudgeUpBtn" type="button">↑ 上</button>
        <button id="nudgeLeftBtn" type="button">← 左</button>
        <button id="nudgeRightBtn" type="button">右 →</button>
        <button id="nudgeDownBtn" type="button">↓ 下</button>
      </div>
      <button id="nudgeStepBtn" type="button">微調距離：1px</button>
    </div>

    <div class="tool-section view-section">
      <div class="tool-title">手機縮放 / 畫布</div>
      <div class="tool-note">雙指縮放、按鈕縮放；開啟拖動畫布後可單指移動畫布。</div>
      <div class="zoom-buttons">
        <button id="zoomOutBtn" type="button">－ 縮小</button>
        <button id="zoomInBtn" type="button">＋ 放大</button>
      </div>
      <button id="fitViewBtn" type="button">適合螢幕</button>
      <button id="resetViewBtn" type="button">100% 原始</button>
      <button id="panModeBtn" type="button">開啟拖動畫布模式</button>
    </div>

    <div class="tool-section rotate-section">
      <div class="tool-title">Transform UI / 旋轉</div>
      <div class="tool-note">拖白點縮放、拖青色圓點旋轉</div>
      <div class="tool-note">Shift 鎖比例／15°，Alt 中心縮放</div>
      <div class="rotate-button-row">
        <button id="rotateLeftBtn" type="button">↺ 左轉 15°</button>
        <button id="rotateResetBtn" type="button">重設角度</button>
        <button id="rotateRightBtn" type="button">↻ 右轉 15°</button>
      </div>
    </div>

    <button id="distributeHBtn">Smart Distribute 水平</button>
    <button id="distributeVBtn">Smart Distribute 垂直</button>

    <details class="tool-section export-section" open>
      <summary id="exportSummary" class="tool-title">真正裁切 / PNG 透明匯出</summary>
      <label class="tool-check">
        <input type="checkbox" id="removeBgCheck" checked />
        去底輸出 transparency
      </label>

      <label class="tool-label">去底容差 <span id="tolLabel">34</span></label>
      <input type="range" id="bgTolerance" min="1" max="120" value="34" />

      <label class="tool-label">邊緣柔化 <span id="featherLabel">8</span></label>
      <input type="range" id="bgFeather" min="0" max="40" value="8" />

      <label class="tool-label">輸出規格</label>
      <select id="exportPreset">
        ${renderPresetOptions()}
      </select>
      <div id="presetButtonGrid" class="preset-button-grid">
        ${renderPresetButtons()}
      </div>
      <div id="presetNote" class="tool-note"></div>

      <label class="tool-label">自動命名前綴</label>
      <input id="filenamePrefix" class="text-input" type="text" value="sticker" maxlength="40" placeholder="例如：sticker" />
      <div id="fileNamingNote" class="tool-note"></div>

      <button id="previewCropBtn">預覽選取裁切</button>
      <button id="checkLineBtn">LINE 匯出檢查</button>
      <button id="exportSelectedBtn">匯出選取 PNG</button>
      <button id="exportAllBtn">全部裁切 ZIP</button>
      <div id="cropPreview" class="crop-preview"><div class="preview-empty">選取裁切框後可預覽透明 PNG</div></div>
      <div id="lineCheckReport" class="line-check-report"><div class="preview-empty">按「LINE 匯出檢查」可檢查尺寸、透明背景與自動命名。</div></div>
    </details>
  </div>
  `;

  const uploadInput = document.getElementById("uploadInput");

  function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
  }

  function makeCropName(index) {
    return `Crop ${index + 1}`;
  }

  function generateEvenGridCropBoxes(columns, rows) {
    if (!editorStore.image?.width || !editorStore.image?.height) {
      alert("請先上傳圖片");
      return;
    }

    const imageW = editorStore.image.width;
    const imageH = editorStore.image.height;
    const cols = clampNumber(columns, 1, 21);
    const rowCount = clampNumber(rows, 1, 31);

    const colEdges = [];
    const rowEdges = [];
    for (let c = 0; c <= cols; c += 1) colEdges.push((imageW * c) / cols);
    for (let r = 0; r <= rowCount; r += 1) rowEdges.push((imageH * r) / rowCount);

    const boxes = [];
    for (let r = 0; r < rowCount; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        boxes.push({
          x: colEdges[c],
          y: rowEdges[r],
          width: colEdges[c + 1] - colEdges[c],
          height: rowEdges[r + 1] - rowEdges[r],
          rotation: 0,
          visible: true,
          locked: false,
          opacity: 1,
          name: makeCropName(boxes.length)
        });
      }
    }
    return boxes;
  }

  function applyGeneratedBoxes(boxes, statusText, options = {}) {
    if (!Array.isArray(boxes) || !boxes.length) {
      alert("沒有可建立的裁切框");
      return;
    }
    replaceBoxes(boxes, statusText, options);
  }

  function applyGridTemplate(columns, rows, label) {
    if (!editorStore.image?.width || !editorStore.image?.height) {
      alert("請先上傳圖片");
      return;
    }
    setEditableGridTemplate(columns, rows, label || `已建立 ${columns}×${rows} 可拖曳切割線模板`);
  }

  function readGridLineSettings() {
    const verticalEl = document.getElementById("verticalLinesInput");
    const horizontalEl = document.getElementById("horizontalLinesInput");
    const verticalLines = clampNumber(parseInt(verticalEl?.value || "3", 10), 0, 20);
    const horizontalLines = clampNumber(parseInt(horizontalEl?.value || "3", 10), 0, 30);
    if (verticalEl) verticalEl.value = String(verticalLines);
    if (horizontalEl) horizontalEl.value = String(horizontalLines);
    return { verticalLines, horizontalLines, columns: verticalLines + 1, rows: horizontalLines + 1 };
  }

  function syncGridResultNote() {
    const note = document.getElementById("gridResultNote");
    if (!note) return;
    const { verticalLines, horizontalLines, columns, rows } = readGridLineSettings();
    note.textContent = `目前設定：縱向切割線 ${verticalLines} 條、橫向切割線 ${horizontalLines} 條 → ${columns} 欄 × ${rows} 列，共 ${columns * rows} 格。按「一鍵產生自訂宮格模板」後，可直接拖曳青色切割線。`;
  }

  function setGridLineInputs(columns, rows) {
    const verticalEl = document.getElementById("verticalLinesInput");
    const horizontalEl = document.getElementById("horizontalLinesInput");
    if (verticalEl) verticalEl.value = String(Math.max(0, columns - 1));
    if (horizontalEl) horizontalEl.value = String(Math.max(0, rows - 1));
    syncGridResultNote();
  }

  function generateCustomGridBoxes() {
    const { columns, rows } = readGridLineSettings();
    applyGridTemplate(columns, rows, `已建立 ${columns} 欄 × ${rows} 列自訂宮格，可拖曳切割線調整`);
  }

  function generatePresetGrid(columns, rows, label = `${columns}×${rows}`) {
    setGridLineInputs(columns, rows);
    applyGridTemplate(columns, rows, `已套用 ${label} 模板，可直接拖曳切割線調整`);
  }

  function generateSnappedGridBoxes() {
    const { columns, rows } = readGridLineSettings();
    const boxes = generateEvenGridCropBoxes(columns, rows);
    const snapped = snapBoxesToContent(editorStore.image, boxes);
    applyGeneratedBoxes(snapped, `已先平均切成 ${columns} 欄 × ${rows} 列，並自動吸附到每格圖案邊界`);
  }

  async function runAutoDetectCropBoxes({ resetHistory = false } = {}) {
    if (!editorStore.image) {
      alert("請先上傳圖片");
      return;
    }

    const previousBoxes = editorStore.boxes.map((box) => ({ ...box }));
    const detectedBoxes = autoDetectCropBoxesFromImage(editorStore.image);

    if (resetHistory) {
      editorStore.history = [];
      editorStore.historyIndex = -1;
    } else if (editorStore.boxes.length) {
      saveHistory();
    }

    editorStore.boxes = detectedBoxes;
    editorStore.selected = detectedBoxes.length ? [0] : [];
    editorStore.activeBox = detectedBoxes.length ? 0 : -1;
    editorStore.gridTemplate = { active: false, columns: 0, rows: 0, verticalLines: [], horizontalLines: [] };

    const looksLikeFullImageBox = detectedBoxes.length === 1
      && (detectedBoxes[0].width * detectedBoxes[0].height) >= (editorStore.image.width * editorStore.image.height * 0.82);

    if (!detectedBoxes.length && !previousBoxes.length) {
      editorStore.transformStatus = "未偵測到裁切框，請改用 4×4 / 5×8 平均切格";
    } else if (!detectedBoxes.length && previousBoxes.length) {
      editorStore.transformStatus = "未偵測到裁切框，已清空舊裁切框；建議改用 4×4 / 5×8 平均切格";
    } else if (looksLikeFullImageBox) {
      editorStore.transformStatus = "自動預測只找到整張圖；建議改用下方 4×4 / 5×8 平均切格";
    } else {
      editorStore.transformStatus = `已自動預測 ${detectedBoxes.length} 個裁切框`;
    }

    saveHistory();
    renderLayers();
    draw();
  }

  uploadInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (ev) => {
      const img = new Image();
      img.onload = async () => {
        setImageAndFit(img);
        setPanMode(false);
        syncPanButtons();
        await runAutoDetectCropBoxes({ resetHistory: true });
      };
      img.src = ev.target.result;
    };

    reader.readAsDataURL(file);
  });

  function syncPanButtons() {
    const label = editorStore.viewPanMode ? "關閉拖動畫布模式" : "開啟拖動畫布模式";
    const panBtn = document.getElementById("panModeBtn");
    const floatPanBtn = document.getElementById("floatPanModeBtn");
    if (panBtn) {
      panBtn.textContent = label;
      panBtn.classList.toggle("active", editorStore.viewPanMode);
    }
    if (floatPanBtn) {
      floatPanBtn.textContent = editorStore.viewPanMode ? "裁切" : "拖移";
      floatPanBtn.classList.toggle("active", editorStore.viewPanMode);
    }
  }

  function syncMultiSelectButtons() {
    const toolbarBtn = document.getElementById("multiSelectBtn");
    const floatBtn = document.getElementById("floatMultiSelectBtn");
    const active = !!editorStore.mobileMultiSelectMode;
    if (toolbarBtn) {
      toolbarBtn.textContent = active ? "多選模式：開" : "多選模式：關";
      toolbarBtn.classList.toggle("active", active);
    }
    if (floatBtn) {
      floatBtn.textContent = active ? "單選" : "多選";
      floatBtn.classList.toggle("active", active);
    }
    document.body.classList.toggle("multi-select-mode", active);
  }

  function toggleMultiSelectMode() {
    editorStore.mobileMultiSelectMode = !editorStore.mobileMultiSelectMode;
    if (editorStore.mobileMultiSelectMode) {
      setPanMode(false);
      syncPanButtons();
    }
    syncMultiSelectButtons();
    draw();
  }
  function syncSelectAllButton() {
    const button = document.getElementById("selectAllBtn");
    if (!button) return;
    const selectable = editorStore.boxes
      .map((box, index) => (box && box.visible !== false ? index : null))
      .filter((index) => index !== null);
    const allSelected = selectable.length > 0 && selectable.every((index) => editorStore.selected.includes(index));
    button.textContent = allSelected ? "取消全選" : "全選裁切框";
    button.classList.toggle("active", allSelected);
  }

  function syncCropManageNote(message = "") {
    const note = document.getElementById("cropManageNote");
    if (!note) return;
    const selectedCount = editorStore.selected?.length || 0;
    const totalCount = editorStore.boxes?.length || 0;
    note.textContent = message || `目前共有 ${totalCount} 個 Crop，已選取 ${selectedCount} 個。`;
  }

  function syncBatchOpacityLabel() {
    if (!batchOpacityRange || !batchOpacityLabel) return;
    batchOpacityLabel.textContent = `${batchOpacityRange.value}%`;
  }


  function deleteSelectedAction() {
    if (!editorStore.selected.length) {
      alert("請先選取要刪除的裁切框");
      return;
    }
    deleteSelectedBoxes();
    syncSelectAllButton();
    syncCropManageNote("已刪除選取的 Crop");
  }

  function selectAllBoxes() {
    const selectedAll = toggleSelectAllCrops();
    syncSelectAllButton();
    syncCropManageNote(selectedAll ? "已全選所有可見 Crop" : "已取消全選");
  }

  function scrollToLayers() {
    const panel = document.querySelector(".right-panel") || document.getElementById("layers");
    panel?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function safeAction(action) {
    return (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      action();
    };
  }

  function bindPress(id, action) {
    const el = document.getElementById(id);
    if (!el) return;
    let lastRun = 0;
    const handler = async (e) => {
      const now = Date.now();
      if (now - lastRun < 260) {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        return;
      }
      lastRun = now;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      try {
        await action(e);
      } catch (error) {
        console.error(error);
        alert(error?.message || "操作失敗，請重新試一次");
      }
    };
    el.addEventListener("pointerdown", handler, { passive: false });
    el.addEventListener("touchstart", handler, { passive: false });
    el.addEventListener("click", handler);
  }

  bindPress("zoomOutBtn", zoomOut);
  bindPress("zoomInBtn", zoomIn);
  bindPress("fitViewBtn", () => fitImageToView());
  bindPress("resetViewBtn", resetView);
  bindPress("panModeBtn", () => {
    togglePanMode();
    if (editorStore.viewPanMode) editorStore.mobileMultiSelectMode = false;
    syncPanButtons();
    syncMultiSelectButtons();
  });

  bindPress("floatZoomOutBtn", zoomOut);
  bindPress("floatZoomInBtn", zoomIn);
  bindPress("floatFitViewBtn", () => fitImageToView());
  bindPress("floatPanModeBtn", () => {
    togglePanMode();
    if (editorStore.viewPanMode) editorStore.mobileMultiSelectMode = false;
    syncPanButtons();
    syncMultiSelectButtons();
  });

  bindPress("multiSelectBtn", toggleMultiSelectMode);
  bindPress("floatMultiSelectBtn", toggleMultiSelectMode);
  bindPress("selectAllBtn", selectAllBoxes);
  bindPress("deleteSelectedBtn", deleteSelectedAction);
  bindPress("sortCropsBtn", () => {
    sortCropsByNumber();
    syncSelectAllButton();
    syncCropManageNote("已依 Crop 編號固定排序，並重新整理編號");
  });
  bindPress("duplicateCropBtn", () => {
    const count = duplicateSelectedCrops();
    syncSelectAllButton();
    syncCropManageNote(count ? `已複製 ${count} 個 Crop` : "未複製任何 Crop");
  });
  bindPress("deleteEmptyBtn", () => {
    const count = deleteEmptyCrops();
    syncSelectAllButton();
    syncCropManageNote(count ? `已刪除 ${count} 個空白 Crop` : "未偵測到空白 Crop");
  });
  bindPress("applySizeToAllBtn", () => {
    const count = applyReferenceSizeToAll();
    syncSelectAllButton();
    syncCropManageNote(count ? `已將基準 Crop 的尺寸套用到其他 ${count} 個 Crop` : "沒有可套用的 Crop");
  });
  bindPress("lockSelectedBtn", () => {
    const count = setLockedForTargets(true);
    syncSelectAllButton();
    syncCropManageNote(count ? `已批次鎖定 ${count} 個 Crop` : "沒有可鎖定的 Crop");
  });
  bindPress("unlockSelectedBtn", () => {
    const count = setLockedForTargets(false);
    syncSelectAllButton();
    syncCropManageNote(count ? `已批次解鎖 ${count} 個 Crop` : "沒有可解鎖的 Crop");
  });
  bindPress("applyOpacityBtn", () => {
    const value = Number(batchOpacityRange?.value || 100) / 100;
    const count = setOpacityForTargets(value);
    syncSelectAllButton();
    syncCropManageNote(count ? `已將 ${count} 個 Crop 的透明度調整為 ${Math.round(value * 100)}%` : "沒有可調整透明度的 Crop");
  });
  bindPress("batchRenameBtn", () => {
    const prefix = document.getElementById("batchRenamePrefix")?.value || "Crop";
    const count = editorStore.selected?.length ? batchRenameCrops(prefix) : (batchRenameCrops(prefix) || 0);
    syncSelectAllButton();
    syncCropManageNote(count ? `已將 ${count} 個 Crop 批次重新命名為 ${prefix} 01、${prefix} 02 ...` : "沒有可重新命名的 Crop");
  });
  bindPress("autoDetectBtn", () => runAutoDetectCropBoxes({ resetHistory: false }));
  bindPress("gridLine16Btn", () => generatePresetGrid(4, 4, "LINE 16 宮格 4×4"));
  bindPress("gridLine8Btn", () => generatePresetGrid(4, 2, "LINE 8 宮格 4×2"));
  bindPress("grid4x4Btn", () => generatePresetGrid(4, 4, "4×4 平均切格"));
  bindPress("grid5x8Btn", () => generatePresetGrid(5, 8, "5×8 平均切格"));
  bindPress("generateGridBtn", generateCustomGridBoxes);
  bindPress("snapGridBtn", generateSnappedGridBoxes);

  const verticalLinesInput = document.getElementById("verticalLinesInput");
  const horizontalLinesInput = document.getElementById("horizontalLinesInput");
  [verticalLinesInput, horizontalLinesInput].forEach((input) => {
    input?.addEventListener("input", syncGridResultNote);
    input?.addEventListener("change", syncGridResultNote);
  });
  syncGridResultNote();
  syncMultiSelectButtons();
  syncSelectAllButton();
  syncCropManageNote();
  syncBatchOpacityLabel();
  batchOpacityRange?.addEventListener("input", syncBatchOpacityLabel);
  document.addEventListener("crop-ui-updated", () => {
    syncSelectAllButton();
    syncCropManageNote();
  });

  bindPress("floatScrollTopBtn", () => {
    document.querySelector(".left-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  bindPress("floatLayersBtn", scrollToLayers);
  bindPress("scrollLayersBtn", scrollToLayers);

  const floatingZoom = document.querySelector(".floating-zoom");
  const floatingNudge = document.querySelector(".floating-nudge");
  ["pointerdown", "pointermove", "pointerup", "touchstart", "touchmove", "touchend", "mousedown", "click"].forEach((eventName) => {
    [floatingZoom, floatingNudge].forEach((floatingPanel) => {
      floatingPanel?.addEventListener(eventName, (e) => {
        e.stopPropagation();
      }, { passive: false });
    });
  });

  syncPanButtons();
  syncMultiSelectButtons();

  function runUndo() {
    undo();
    renderLayers();
    draw();
  }

  function runRedo() {
    redo();
    renderLayers();
    draw();
  }

  function ensureSelectedBoxes() {
    if (editorStore.selected.length > 0) return true;
    if (editorStore.boxes.length === 1) {
      editorStore.selected = [0];
      renderLayers();
      draw();
      return true;
    }
    if (editorStore.boxes.length > 1) {
      editorStore.selected = [editorStore.boxes.length - 1];
      renderLayers();
      draw();
      return true;
    }
    alert("請先新增並選取裁切框");
    return false;
  }

  function nudgeSelected(dx, dy) {
    if (!ensureSelectedBoxes()) return;
    const selected = [...new Set(editorStore.selected)];
    let changed = false;
    selected.forEach((index) => {
      const box = editorStore.boxes[index];
      if (!box || box.locked) return;
      box.x += dx;
      box.y += dy;
      changed = true;
    });
    if (!changed) return;
    saveHistory();
    renderLayers();
    draw();
  }

  function syncNudgeStepButtons() {
    const label = `微調距離：${editorStore.nudgeStep}px`;
    const toolbarStep = document.getElementById("nudgeStepBtn");
    const floatStep = document.getElementById("floatNudgeStepBtn");
    if (toolbarStep) toolbarStep.textContent = label;
    if (floatStep) floatStep.textContent = `${editorStore.nudgeStep}px`;
  }

  function cycleNudgeStep() {
    const steps = [1, 5, 10];
    const current = steps.indexOf(editorStore.nudgeStep);
    editorStore.nudgeStep = steps[(current + 1 + steps.length) % steps.length];
    syncNudgeStepButtons();
  }

  function nudgeBy(direction) {
    const step = editorStore.nudgeStep || 1;
    if (direction === "up") nudgeSelected(0, -step);
    if (direction === "down") nudgeSelected(0, step);
    if (direction === "left") nudgeSelected(-step, 0);
    if (direction === "right") nudgeSelected(step, 0);
  }

  bindPress("undoBtn", runUndo);
  bindPress("redoBtn", runRedo);
  bindPress("floatUndoBtn", runUndo);
  bindPress("floatRedoBtn", runRedo);
  bindPress("rotateLeftBtn", () => rotateSelectedByDegrees(-15));
  bindPress("rotateRightBtn", () => rotateSelectedByDegrees(15));
  bindPress("rotateResetBtn", () => resetSelectedRotation());

  bindPress("nudgeUpBtn", () => nudgeBy("up"));
  bindPress("nudgeDownBtn", () => nudgeBy("down"));
  bindPress("nudgeLeftBtn", () => nudgeBy("left"));
  bindPress("nudgeRightBtn", () => nudgeBy("right"));
  bindPress("nudgeStepBtn", cycleNudgeStep);
  bindPress("floatNudgeUpBtn", () => nudgeBy("up"));
  bindPress("floatNudgeDownBtn", () => nudgeBy("down"));
  bindPress("floatNudgeLeftBtn", () => nudgeBy("left"));
  bindPress("floatNudgeRightBtn", () => nudgeBy("right"));
  bindPress("floatNudgeStepBtn", cycleNudgeStep);
  syncNudgeStepButtons();

  bindPress("addBoxBtn", () => {
    createCropBoxCentered();
    syncPanButtons();
    syncSelectAllButton();
    syncCropManageNote("已新增 1 個 Crop");
  });

  bindPress("distributeHBtn", () => {
    distributeSelected("horizontal");
  });

  bindPress("distributeVBtn", () => {
    distributeSelected("vertical");
  });

  const removeBgCheck = document.getElementById("removeBgCheck");
  const tolerance = document.getElementById("bgTolerance");
  const feather = document.getElementById("bgFeather");
  const preset = document.getElementById("exportPreset");
  const presetButtons = Array.from(document.querySelectorAll(".preset-choice"));
  const presetNote = document.getElementById("presetNote");
  const filenamePrefix = document.getElementById("filenamePrefix");
  const fileNamingNote = document.getElementById("fileNamingNote");
  const batchOpacityRange = document.getElementById("batchOpacityRange");
  const batchOpacityLabel = document.getElementById("batchOpacityLabel");
  const tolLabel = document.getElementById("tolLabel");
  const featherLabel = document.getElementById("featherLabel");

  function syncExportOptions() {
    const presetKey = preset.value || "scale1";
    const presetDef = EXPORT_PRESETS[presetKey] || EXPORT_PRESETS.scale1;
    const prefix = String(filenamePrefix?.value || "sticker").trim() || "sticker";
    editorStore.exportOptions = {
      removeBackground: removeBgCheck.checked,
      tolerance: Number(tolerance.value),
      feather: Number(feather.value),
      preset: presetKey,
      scale: presetDef?.scale || 1,
      margin: presetKey === "lineSticker" ? 10 : 0,
      filenamePrefix: prefix
    };
    presetButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.preset === presetKey);
    });
    editorStore.bgTolerance = Number(tolerance.value);
    editorStore.bgFeather = Number(feather.value);
    tolLabel.textContent = tolerance.value;
    featherLabel.textContent = feather.value;
    const selectedPreset = EXPORT_PRESETS[preset.value] || EXPORT_PRESETS.scale1;
    if (selectedPreset?.type === "fit") {
      presetNote.textContent = `${selectedPreset.label}：等比例縮放放入透明畫布，保留完整內容。`;
    } else if (selectedPreset?.type === "cover") {
      presetNote.textContent = `${selectedPreset.label}：固定尺寸輸出，畫面置中填滿，可能裁掉邊緣。`;
    } else {
      presetNote.textContent = `${selectedPreset.label}：依裁切框尺寸乘倍率輸出。`;
    }
    if (fileNamingNote) {
      fileNamingNote.textContent = `自動命名預覽：${prefix}_01.png、${prefix}_02.png、${prefix}_03.png …`;
    }
  }

  presetButtons.forEach((btn) => {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      preset.value = btn.dataset.preset;
      syncExportOptions();
    }, { passive: false });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      preset.value = btn.dataset.preset;
      syncExportOptions();
    });
  });

  [removeBgCheck, tolerance, feather, preset, filenamePrefix].forEach((el) => {
    el.addEventListener("input", syncExportOptions);
    el.addEventListener("change", syncExportOptions);
  });
  syncExportOptions();

  const exportDetails = document.querySelector(".export-section");
  const exportSummary = document.getElementById("exportSummary");
  if (window.matchMedia?.("(max-width: 900px)").matches) {
    exportDetails?.removeAttribute("open");
  }
  if (exportDetails && exportSummary) {
    let lastToggle = 0;
    const toggleExportDetails = (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      const now = Date.now();
      if (now - lastToggle < 250) return;
      lastToggle = now;
      exportDetails.toggleAttribute("open");
      if (exportDetails.open) {
        window.setTimeout(() => exportDetails.scrollIntoView({ behavior: "smooth", block: "nearest" }), 30);
      }
    };
    exportSummary.addEventListener("pointerdown", toggleExportDetails, { passive: false });
    exportSummary.addEventListener("touchstart", toggleExportDetails, { passive: false });
    exportSummary.addEventListener("click", toggleExportDetails);
  }

  bindPress("previewCropBtn", () => {
    syncExportOptions();
    previewCrop();
  });

  bindPress("checkLineBtn", () => {
    syncExportOptions();
    renderLineExportReport(false);
  });

  bindPress("exportSelectedBtn", async () => {
    syncExportOptions();
    await exportSelectedPng();
  });

  bindPress("exportAllBtn", async () => {
    syncExportOptions();
    renderLineExportReport(false);
    await exportZip(false);
  });
}
