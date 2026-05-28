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
    title.onclick = (e) => e.stopPropagation();

    const visible = document.createElement("button");
    visible.innerHTML = box.visible === false ? "🙈" : "👁";
    visible.onclick = (e) => {
      e.stopPropagation();
      box.visible = !box.visible;
      renderLayers();
      draw();
    };

    const lock = document.createElement("button");
    lock.innerHTML = box.locked ? "🔒" : "🔓";
    lock.onclick = (e) => {
      e.stopPropagation();
      box.locked = !box.locked;
      renderLayers();
      draw();
    };

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
