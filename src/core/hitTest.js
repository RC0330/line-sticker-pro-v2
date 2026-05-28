import { getBoxCenter, unrotatePoint } from "./geometry.js";

export function pointInBox(x, y, box) {
  const center = getBoxCenter(box);
  const local = unrotatePoint({ x, y }, center, box.rotation || 0);

  return (
    local.x > box.x &&
    local.x < box.x + box.width &&
    local.y > box.y &&
    local.y < box.y + box.height
  );
}

export function pointInHandle(x, y, box, size) {
  const hx = box.x + box.width;
  const hy = box.y + box.height;
  const dx = x - hx;
  const dy = y - hy;

  return Math.sqrt(dx * dx + dy * dy) < size;
}
