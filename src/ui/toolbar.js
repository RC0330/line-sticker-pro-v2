import { editorStore } from "../store/editorStore.js";
import { createCropBoxCentered, deleteSelectedBoxes, distributeSelected, draw, fitImageToView, resetView, setImageAndFit, setPanMode, togglePanMode, zoomIn, zoomOut } from "../core/canvas.js";
import { EXPORT_PRESETS, exportSelectedPng, exportZip, previewCrop } from "../core/exporter.js";
import { undo, redo, saveHistory } from "../core/history.js";
import { renderLayers } from "./layer-panel.js";

export function initToolbar() {
  const toolbar = document.getElementById("toolbar");

  function renderPresetOptions() {
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
    return Object.entries(presets)
      .map(([key, preset]) => `<option value="${key}">${preset.label}</option>`)
      .join("");
  }

  toolbar.innerHTML = `
  <div class="toolbar-wrap">
    <div class="version-badge">v25 已載入｜展開/Layers/長按回饋修正</div>

    <div class="quick-history-buttons quick-history-top">
      <button id="undoBtn" type="button">↶ 復原</button>
      <button id="redoBtn" type="button">↷ 重做</button>
    </div>

    <div class="quick-history-buttons mobile-select-top">
      <button id="multiSelectBtn" type="button">多選模式：關</button>
      <button id="selectAllBtn" type="button">全選裁切框</button>
    </div>

    <button id="deleteSelectedBtn" class="danger-button delete-selected-top" type="button">刪除已選裁切框</button>
    <button id="scrollLayersBtn" class="secondary-button scroll-layers-top" type="button">顯示 Layers / 圖層</button>

    <input type="file" id="uploadInput" accept="image/*" />

    <button id="addBoxBtn">新增裁切框</button>

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

    <div class="tool-section">
      <div class="tool-title">Transform UI</div>
      <div class="tool-note">拖白點縮放、拖圓點旋轉</div>
      <div class="tool-note">Shift 鎖比例／15°，Alt 中心縮放</div>
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
      <div id="presetNote" class="tool-note"></div>

      <button id="previewCropBtn">預覽選取裁切</button>
      <button id="exportSelectedBtn">匯出選取 PNG</button>
      <button id="exportAllBtn">全部裁切 ZIP</button>
      <div id="cropPreview" class="crop-preview"><div class="preview-empty">選取裁切框後可預覽透明 PNG</div></div>
    </details>
  </div>
  `;

  const uploadInput = document.getElementById("uploadInput");

  uploadInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (ev) => {
      const img = new Image();
      img.onload = () => {
        setImageAndFit(img);
        setPanMode(false);
        syncPanButtons();
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

  function deleteSelectedAction() {
    if (!editorStore.selected.length) {
      alert("請先選取要刪除的裁切框");
      return;
    }
    deleteSelectedBoxes();
  }

  function selectAllBoxes() {
    editorStore.selected = editorStore.boxes
      .map((box, index) => (box && box.visible !== false && box.locked !== true ? index : null))
      .filter((index) => index !== null);
    renderLayers();
    draw();
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
  syncMultiSelectButtons();

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
  const presetNote = document.getElementById("presetNote");
  const tolLabel = document.getElementById("tolLabel");
  const featherLabel = document.getElementById("featherLabel");

  function syncExportOptions() {
    editorStore.exportOptions = {
      removeBackground: removeBgCheck.checked,
      tolerance: Number(tolerance.value),
      feather: Number(feather.value),
      preset: preset.value,
      scale: EXPORT_PRESETS[preset.value]?.scale || 1,
      margin: preset.value === "lineSticker" ? 10 : 0
    };
    editorStore.bgTolerance = Number(tolerance.value);
    editorStore.bgFeather = Number(feather.value);
    tolLabel.textContent = tolerance.value;
    featherLabel.textContent = feather.value;
    const selectedPreset = EXPORT_PRESETS[preset.value];
    if (selectedPreset?.type === "fit") {
      presetNote.textContent = `${selectedPreset.label}：等比例縮放放入透明畫布，保留完整內容。`;
    } else if (selectedPreset?.type === "cover") {
      presetNote.textContent = `${selectedPreset.label}：固定尺寸輸出，畫面置中填滿，可能裁掉邊緣。`;
    } else {
      presetNote.textContent = `${selectedPreset.label}：依裁切框尺寸乘倍率輸出。`;
    }
  }

  [removeBgCheck, tolerance, feather, preset].forEach((el) => {
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

  bindPress("exportSelectedBtn", async () => {
    syncExportOptions();
    await exportSelectedPng();
  });

  bindPress("exportAllBtn", async () => {
    syncExportOptions();
    await exportZip(false);
  });
}
