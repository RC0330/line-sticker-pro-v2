import {
  editorStore
} from "../store/editorStore.js";

export function moveLayerUp() {

  if (
    editorStore.selected.length !== 1
  ) return;

  const index =
    editorStore.selected[0];

  if (
    index >=
    editorStore.boxes.length - 1
  ) return;

  const temp =
    editorStore.boxes[index];

  editorStore.boxes[index] =
    editorStore.boxes[index + 1];

  editorStore.boxes[index + 1] =
    temp;

  editorStore.selected =
    [index + 1];
}

export function moveLayerDown() {

  if (
    editorStore.selected.length !== 1
  ) return;

  const index =
    editorStore.selected[0];

  if (index <= 0)
    return;

  const temp =
    editorStore.boxes[index];

  editorStore.boxes[index] =
    editorStore.boxes[index - 1];

  editorStore.boxes[index - 1] =
    temp;

  editorStore.selected =
    [index - 1];
}

export function bringToFront() {

  if (
    editorStore.selected.length !== 1
  ) return;

  const index =
    editorStore.selected[0];

  const layer =
    editorStore.boxes.splice(
      index,
      1
    )[0];

  editorStore.boxes.push(
    layer
  );

  editorStore.selected = [

    editorStore.boxes.length - 1
  ];
}

export function sendToBack() {

  if (
    editorStore.selected.length !== 1
  ) return;

  const index =
    editorStore.selected[0];

  const layer =
    editorStore.boxes.splice(
      index,
      1
    )[0];

  editorStore.boxes.unshift(
    layer
  );

  editorStore.selected = [0];
}