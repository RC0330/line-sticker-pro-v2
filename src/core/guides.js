export function drawGuides(
  ctx,
  canvas
) {

  const cx =
    canvas.width / 2;

  const cy =
    canvas.height / 2;

  ctx.save();

  ctx.strokeStyle =
    "rgba(0,255,255,0.5)";

  ctx.setLineDash([8]);

  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, canvas.height);

  ctx.moveTo(0, cy);
  ctx.lineTo(canvas.width, cy);

  ctx.stroke();

  ctx.restore();
}