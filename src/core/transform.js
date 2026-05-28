export function scaleBox(
  box,
  origin,
  scaleX,
  scaleY
) {

  const offsetX =
    box.x - origin.x;

  const offsetY =
    box.y - origin.y;

  box.x =
    origin.x +
    offsetX * scaleX;

  box.y =
    origin.y +
    offsetY * scaleY;

  box.width *= scaleX;

  box.height *= scaleY;
}