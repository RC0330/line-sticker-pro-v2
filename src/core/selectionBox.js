export function normalizeRect(r) {

  let x = r.x;
  let y = r.y;

  let width =
    r.width;

  let height =
    r.height;

  if (width < 0) {

    x += width;

    width =
      Math.abs(width);
  }

  if (height < 0) {

    y += height;

    height =
      Math.abs(height);
  }

  return {

    x,
    y,
    width,
    height,

    right:
      x + width,

    bottom:
      y + height
  };
}

// ===== 完全包含 =====

export function boxInsideSelection(
  box,
  rect
) {

  const r =
    normalizeRect(rect);

  return (

    box.x >= r.x &&
    box.y >= r.y &&

    box.x + box.width <=
      r.right &&

    box.y + box.height <=
      r.bottom
  );
}

// ===== touch =====

export function boxTouchSelection(
  box,
  rect
) {

  const r =
    normalizeRect(rect);

  return !(
    box.x > r.right ||

    box.x + box.width < r.x ||

    box.y > r.bottom ||

    box.y + box.height < r.y
  );
}