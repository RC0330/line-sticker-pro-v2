import { getAxisBoundsFromPoints, getBoxCorners } from "./geometry.js";

export function getBounds(boxes) {
  const visibleBoxes = boxes.filter(Boolean);

  if (!visibleBoxes.length) return null;

  return getAxisBoundsFromPoints(
    visibleBoxes.flatMap((box) => getBoxCorners(box))
  );
}
