import {
  editorStore
} from "../store/editorStore.js";

import {
  cloneState
} from "./snapshot.js";

export function saveHistory() {

  const snapshot =
    cloneState({

      boxes:
        editorStore.boxes
    });

  editorStore.history.splice(

    editorStore.historyIndex + 1
  );

  editorStore.history.push(
    snapshot
  );

  editorStore.historyIndex =
    editorStore.history.length - 1;
}

export function undo() {

  if (

    editorStore.historyIndex <= 0

  ) return;

  editorStore.historyIndex--;

  const snapshot =

    editorStore.history[
      editorStore.historyIndex
    ];

  restore(snapshot);
}

export function redo() {

  if (

    editorStore.historyIndex >=

    editorStore.history.length - 1

  ) return;

  editorStore.historyIndex++;

  const snapshot =

    editorStore.history[
      editorStore.historyIndex
    ];

  restore(snapshot);
}

function restore(
  snapshot
) {

  editorStore.boxes =

    cloneState(
      snapshot.boxes
    );

  editorStore.selected = [];
}