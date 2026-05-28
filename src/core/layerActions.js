import {
  editorStore
} from "../store/editorStore.js";

export function toggleVisible(
  index
) {

  const layer =
    editorStore.boxes[index];

  if (!layer)
    return;

  layer.visible =
    !layer.visible;
}

export function toggleLock(
  index
) {

  const layer =
    editorStore.boxes[index];

  if (!layer)
    return;

  layer.locked =
    !layer.locked;
}

export function renameLayer(
  index,
  name
) {

  const layer =
    editorStore.boxes[index];

  if (!layer)
    return;

  layer.name = name;
}