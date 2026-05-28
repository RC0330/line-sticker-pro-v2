const DEFAULT_SNAP_DISTANCE = 10;

function getEdges(box) {
  return {
    left: box.x,
    right: box.x + box.width,
    top: box.y,
    bottom: box.y + box.height,
    centerX: box.x + box.width / 2,
    centerY: box.y + box.height / 2
  };
}

export function getGuides(movingBox, boxes, options = {}) {
  const guides = [];
  let snapX = null;
  let snapY = null;
  let bestX = options.snapDistance ?? DEFAULT_SNAP_DISTANCE;
  let bestY = options.snapDistance ?? DEFAULT_SNAP_DISTANCE;

  const moving = getEdges(movingBox);

  const targets = boxes
    .filter((box) => box && box.visible !== false)
    .map((box) => getEdges(box));

  if (options.canvasWidth && options.canvasHeight) {
    targets.push({
      left: 0,
      right: options.canvasWidth,
      top: 0,
      bottom: options.canvasHeight,
      centerX: options.canvasWidth / 2,
      centerY: options.canvasHeight / 2
    });
  }

  targets.forEach((target) => {
    ["left", "right", "centerX"].forEach((a) => {
      ["left", "right", "centerX"].forEach((b) => {
        const distance = Math.abs(moving[a] - target[b]);
        if (distance < bestX) {
          bestX = distance;
          snapX = target[b] - moving[a];
        }
        if (distance < (options.snapDistance ?? DEFAULT_SNAP_DISTANCE)) {
          guides.push({ type: "v", x: target[b] });
        }
      });
    });

    ["top", "bottom", "centerY"].forEach((a) => {
      ["top", "bottom", "centerY"].forEach((b) => {
        const distance = Math.abs(moving[a] - target[b]);
        if (distance < bestY) {
          bestY = distance;
          snapY = target[b] - moving[a];
        }
        if (distance < (options.snapDistance ?? DEFAULT_SNAP_DISTANCE)) {
          guides.push({ type: "h", y: target[b] });
        }
      });
    });
  });

  return { guides, snapX, snapY };
}
