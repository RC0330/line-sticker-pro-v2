import {
  editorStore
} from "../store/editorStore.js";

import {
  draw,
  deleteSelectedBoxes
} from "./canvas.js";

import {
  undo,
  redo
} from "./history.js";

import {

  moveLayerUp,
  moveLayerDown,
  bringToFront,
  sendToBack

} from "./layerManager.js";


export function initKeyboard() {

  window.addEventListener(
    "keydown",
    (e) => {

      // ===== delete =====

      if (
        e.key === "Delete"
      ) {

        deleteSelectedBoxes();

        draw();
      }

      // ===== ESC =====

      if (
        e.key === "Escape"
      ) {

        editorStore.selected = [];

        editorStore.transformMode =
          false;

        draw();
      }

      // ===== Ctrl+A =====

      if (

        e.ctrlKey &&
        e.key.toLowerCase() === "a"

      ) {

        e.preventDefault();

        editorStore.selected =

          editorStore.boxes.map(
            (_, i) => i
          );

        draw();
      }

      // ===== Ctrl+D =====

      if (

        e.ctrlKey &&
        e.key.toLowerCase() === "d"

      ) {

        e.preventDefault();

        editorStore.selected = [];

        draw();
      }

      // ===== Ctrl+Z =====

      if (

        e.ctrlKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === "z"

      ) {

        e.preventDefault();

        undo();

        draw();
      }

      // ===== Ctrl+Shift+Z =====

      if (

        e.ctrlKey &&
        e.shiftKey &&
        e.key.toLowerCase() === "z"

      ) {

        e.preventDefault();

        redo();

        draw();
      }

      // ===== Shift + T = Transform =====

      if (

        e.shiftKey && 
        e.key.toLowerCase() === "t"

      ) {

        e.preventDefault();

        // ===== 至少2個 =====

        if (

          editorStore.selected.length < 2

        ) return;

        editorStore.transformMode =

          !editorStore.transformMode;

        draw();
      }

      // ===== ] =====

      if (
        e.key === "]"
      ) {

        moveLayerUp();

        draw();
      }

      // ===== [ =====

      if (
        e.key === "["
      ) {

        moveLayerDown();

        draw();
      }

      // ===== Shift+] =====

      if (

        e.shiftKey &&
        e.key === "}"

      ) {

        bringToFront();

        draw();
      }

      // ===== Shift+[ =====

      if (

        e.shiftKey &&
        e.key === "{"

      ) {

        sendToBack();

        draw();
      }

      // ===== arrow move =====

      const moveKeys =

        [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight"
        ];

      if (

        moveKeys.includes(
          e.key
        )

      ) {

        const move =
          e.shiftKey ? 10 : 1;

        editorStore.selected.forEach(
          (index) => {

            const box =
              editorStore.boxes[index];

            if (!box)
              return;

            if (
              box.locked
            ) return;

            if (
              e.key === "ArrowUp"
            ) {

              box.y -= move;
            }

            if (
              e.key === "ArrowDown"
            ) {

              box.y += move;
            }

            if (
              e.key === "ArrowLeft"
            ) {

              box.x -= move;
            }

            if (
              e.key === "ArrowRight"
            ) {

              box.x += move;
            }
          }
        );

        draw();
      }
    }
  );
}