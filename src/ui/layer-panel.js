import { editorStore } from "../store/editorStore.js";
import { draw } from "../core/canvas.js";
import { saveHistory } from "../core/history.js";

function moveLayer(fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;

  const [layer] = editorStore.boxes.splice(fromIndex, 1);
  editorStore.boxes.splice(toIndex, 0, layer);

  editorStore.selected = editorStore.selected
    .map((index) => {
      if (index === fromIndex) return toIndex;
      if (fromIndex < toIndex && index > fromIndex && index <= toIndex) return index - 1;
      if (fromIndex > toIndex && index >= toIndex && index < fromIndex) return index + 1;
      return index;
    })
    .filter((value, pos, arr) => arr.indexOf(value) === pos);

  saveHistory();
}


function bindLayerButton(button, action) {
  let lastRun = 0;

  const stopOnly = (e) => {
    e.preventDefault?.();
    e.stopPropagation?.();
  };

  const run = (e) => {
    stopOnly(e);
    const now = Date.now();
    if (now - lastRun < 220) return;
    lastRun = now;
    action(e);
  };

  button.addEventListener("pointerdown", run, { passive: false });
  button.addEventListener("touchstart", run, { passive: false });
  button.addEventListener("mousedown", stopOnly);
  button.addEventListener("click", run);
}

export function renderLayers() {
  const panel = document.getElementById("layers");
  if (!panel) return;

  panel.innerHTML = `
    <div class="layers-title">Layers</div>
    <div class="layers-hint">可拖曳圖層排序；手機可開啟「多選」或按「全選裁切框」</div>
  `;

  [...editorStore.boxes].reverse().forEach((box, reverseIndex) => {
    const realIndex = editorStore.boxes.length - 1 - reverseIndex;
    const div = document.createElement("div");
    div.className = "layer-item";
    div.draggable = true;
    div.dataset.index = String(realIndex);

    if (editorStore.selected.includes(realIndex)) div.classList.add("active");
    if (box.locked) div.classList.add("locked");

    div.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", String(realIndex));
      e.dataTransfer.effectAllowed = "move";
      div.classList.add("dragging-layer");
    });

    div.addEventListener("dragend", () => {
      div.classList.remove("dragging-layer");
    });

    div.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      div.classList.add("drop-target");
    });

    div.addEventListener("dragleave", () => {
      div.classList.remove("drop-target");
    });

    div.addEventListener("drop", (e) => {
      e.preventDefault();
      div.classList.remove("drop-target");
      const from = Number(e.dataTransfer.getData("text/plain"));
      const to = Number(div.dataset.index);
      moveLayer(from, to);
      renderLayers();
      draw();
    });

    const handle = document.createElement("span");
    handle.className = "layer-drag-handle";
    handle.textContent = "☰";

    const title = document.createElement("input");
    title.value = box.name || `Layer ${realIndex}`;
    title.className = "layer-title";
    title.draggable = false;
    title.oninput = () => {
      box.name = title.value;
    };
    title.addEventListener("pointerdown", (e) => e.stopPropagation());
    title.onclick = (e) => e.stopPropagation();

    const visible = document.createElement("button");
    visible.type = "button";
    visible.className = "layer-visible-btn";
    visible.innerHTML = box.visible === false ? "🙈" : "👁";
    visible.title = box.visible === false ? "顯示裁切框" : "隱藏裁切框";
    bindLayerButton(visible, () => {
      saveHistory();
      box.visible = !box.visible;
      renderLayers();
      draw();
    });

    const lock = document.createElement("button");
    lock.type = "button";
    lock.className = "layer-lock-btn";
    lock.innerHTML = box.locked ? "🔒" : "🔓";
    lock.title = box.locked ? "解除鎖定：可移動 / 縮放 / 旋轉" : "鎖定：避免誤移動 / 誤縮放";
    lock.setAttribute("aria-pressed", box.locked ? "true" : "false");
    if (box.locked) lock.classList.add("active");
    bindLayerButton(lock, () => {
      saveHistory();
      box.locked = !box.locked;
      editorStore.transformStatus = box.locked
        ? `已鎖定 ${box.name || `Crop ${realIndex + 1}`}`
        : `已解除鎖定 ${box.name || `Crop ${realIndex + 1}`}`;

      if (box.locked) {
        editorStore.selected = editorStore.selected.filter((i) => i !== realIndex);
      } else if (!editorStore.selected.includes(realIndex)) {
        editorStore.selected = [realIndex];
      }

      renderLayers();
      draw();
    });

    const opacity = document.createElement("input");
    opacity.type = "range";
    opacity.min = 0;
    opacity.max = 1;
    opacity.step = 0.01;
    opacity.value = box.opacity ?? 1;
    opacity.oninput = () => {
      box.opacity = parseFloat(opacity.value);
      draw();
    };
    opacity.addEventListener("pointerdown", (e) => e.stopPropagation());
    opacity.onchange = () => saveHistory();
    opacity.onclick = (e) => e.stopPropagation();

    div.onclick = (e) => {
      if (e.shiftKey || e.ctrlKey || e.metaKey || editorStore.mobileMultiSelectMode) {
        if (editorStore.selected.includes(realIndex)) {
          editorStore.selected = editorStore.selected.filter((i) => i !== realIndex);
        } else {
          editorStore.selected.push(realIndex);
        }
      } else {
        editorStore.selected = [realIndex];
      }

      renderLayers();
      draw();
    };

    div.appendChild(handle);
    div.appendChild(visible);
    div.appendChild(lock);
    div.appendChild(title);
    div.appendChild(opacity);
    panel.appendChild(div);
  });
}

export function initLayerPanel() {
  renderLayers();
}
