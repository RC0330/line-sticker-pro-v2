export let selectedBoxes = [];

export function clearSelection() {

  selectedBoxes = [];
}

export function selectBox(index) {

  if (
    !selectedBoxes.includes(index)
  ) {
    selectedBoxes.push(index);
  }
}

export function removeSelection(index) {

  selectedBoxes =
    selectedBoxes.filter(
      (v) => v !== index
    );
}