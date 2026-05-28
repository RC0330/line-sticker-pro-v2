function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createOffscreen(width, height) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function sampleBackground(data, width, height) {
  const samples = [];
  const pushPixel = (x, y) => {
    const i = (y * width + x) * 4;
    samples.push([data[i], data[i + 1], data[i + 2], data[i + 3]]);
  };

  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 24))) {
    pushPixel(x, 0);
    pushPixel(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += Math.max(1, Math.floor(height / 24))) {
    pushPixel(0, y);
    pushPixel(width - 1, y);
  }

  const channel = (idx) => samples.map((s) => s[idx]).sort((a, b) => a - b);
  const median = (arr) => arr[Math.floor(arr.length / 2)] ?? 255;

  const r = median(channel(0));
  const g = median(channel(1));
  const b = median(channel(2));
  const a = median(channel(3));

  let variance = 0;
  for (const [sr, sg, sb] of samples) {
    variance += Math.abs(sr - r) + Math.abs(sg - g) + Math.abs(sb - b);
  }
  variance /= Math.max(1, samples.length);

  return { r, g, b, a, variance };
}

function detectContentBounds(image, box) {
  const srcX = Math.max(0, Math.floor(box.x));
  const srcY = Math.max(0, Math.floor(box.y));
  const srcW = Math.max(1, Math.floor(box.width));
  const srcH = Math.max(1, Math.floor(box.height));
  const scale = Math.min(1, 360 / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const offscreen = createOffscreen(width, height);
  const ctx = offscreen.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, srcX, srcY, srcW, srcH, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const bg = sampleBackground(data, width, height);
  const threshold = clamp(Math.round(Math.max(28, bg.variance * 1.3)), 28, 96);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let area = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      const diff = Math.abs(r - bg.r) + Math.abs(g - bg.g) + Math.abs(b - bg.b);
      const foreground = a > 20 && (diff > threshold || (bg.a > 220 && a < 228));
      if (!foreground) continue;
      area += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0 || maxY < 0) return null;
  if (area < Math.max(20, width * height * 0.01)) return null;

  const invScale = 1 / scale;
  const padding = Math.max(4, Math.round(Math.min(srcW, srcH) * 0.035));
  const left = clamp(srcX + minX * invScale - padding, box.x, box.x + box.width - 8);
  const top = clamp(srcY + minY * invScale - padding, box.y, box.y + box.height - 8);
  const right = clamp(srcX + (maxX + 1) * invScale + padding, left + 8, box.x + box.width);
  const bottom = clamp(srcY + (maxY + 1) * invScale + padding, top + 8, box.y + box.height);

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

export function snapBoxesToContent(image, boxes) {
  if (!image?.width || !image?.height || !Array.isArray(boxes)) return [];
  return boxes.map((box, index) => {
    const bounds = detectContentBounds(image, box);
    if (!bounds) return { ...box, name: box.name || `Crop ${index + 1}` };
    return {
      ...box,
      x: bounds.x,
      y: bounds.y,
      width: Math.max(24, bounds.width),
      height: Math.max(24, bounds.height),
      rotation: 0,
      name: box.name || `Crop ${index + 1}`
    };
  });
}
