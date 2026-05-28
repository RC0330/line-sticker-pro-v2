import "./style.css";
import "./ui/photoshop.css";

import {
  initCanvas
} from "./core/canvas.js";

import {
  initToolbar
} from "./ui/toolbar.js";

import {
  initLayerPanel
} from "./ui/layer-panel.js";

import {
  initKeyboard
} from "./core/keyboard.js";

const app =
  document.querySelector("#app");

app.innerHTML = `

<div class="workspace">

  <aside class="left-panel">

    <div id="toolbar"></div>

  </aside>

  <main class="editor">

    <div class="floating-zoom" aria-label="手機縮放工具">
      <button id="floatZoomOutBtn" type="button">－</button>
      <button id="floatZoomInBtn" type="button">＋</button>
      <button id="floatFitViewBtn" type="button">適合</button>
      <button id="floatPanModeBtn" type="button">拖移</button>
      <button id="floatMultiSelectBtn" type="button">多選</button>
      <button id="floatUndoBtn" type="button">↶<br>復原</button>
      <button id="floatRedoBtn" type="button">↷<br>重做</button>
      <button id="floatScrollTopBtn" type="button">功能</button>
      <button id="floatLayersBtn" type="button">圖層</button>
    </div>

    <div class="floating-nudge" aria-label="裁切框微調工具">
      <div class="nudge-title">微調</div>
      <button id="floatNudgeUpBtn" class="nudge-up" type="button">↑</button>
      <button id="floatNudgeLeftBtn" class="nudge-left" type="button">←</button>
      <button id="floatNudgeRightBtn" class="nudge-right" type="button">→</button>
      <button id="floatNudgeDownBtn" class="nudge-down" type="button">↓</button>
      <button id="floatNudgeStepBtn" class="nudge-step" type="button">1px</button>
    </div>

    <canvas id="canvas"></canvas>

  </main>

  <aside class="right-panel">

    <div id="layers"></div>

  </aside>

</div>
`;

initCanvas();

initToolbar();

initLayerPanel();

initKeyboard();