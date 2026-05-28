import { getBoxCenter, rotatePoint } from "./geometry.js";

export function getHandles(box, options = {}) {
  const x = box.x;
  const y = box.y;
  const w = box.width;
  const h = box.height;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const angle = options.rotation || box.rotation || 0;
  const center = { x: cx, y: cy };
  const rotateOffset = options.rotateOffset ?? 42;

  const handles = [
    { name: "nw", x, y },
    { name: "n", x: cx, y },
    { name: "ne", x: x + w, y },
    { name: "e", x: x + w, y: cy },
    { name: "se", x: x + w, y: y + h },
    { name: "s", x: cx, y: y + h },
    { name: "sw", x, y: y + h },
    { name: "w", x, y: cy }
  ].map((handle) => ({
    ...handle,
    ...rotatePoint(handle, center, angle)
  }));

  if (options.rotate !== false) {
    const rotateHandle = rotatePoint(
      { x: cx, y: y - rotateOffset },
      center,
      angle
    );

    handles.push({
      name: "rotate",
      x: rotateHandle.x,
      y: rotateHandle.y,
      isRotate: true
    });
  }

  return handles;
}

export function hitHandle(px, py, handle, size = 10) {
  return Math.abs(px - handle.x) < size && Math.abs(py - handle.y) < size;
}
