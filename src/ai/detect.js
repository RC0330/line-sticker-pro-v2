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

  for (let x = 0; x < width; x += 2) {
    pushPixel(x, 0);
    pushPixel(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 2) {
    pushPixel(0, y);
    pushPixel(width - 1, y);
  }

  if (!samples.length) return { r: 255, g: 255, b: 255, a: 255, variance: 0 };

  const channel = (idx) => samples.map((s) => s[idx]).sort((a, b) => a - b);
  const median = (arr) => arr[Math.floor(arr.length / 2)] ?? 255;

  const rs = channel(0);
  const gs = channel(1);
  const bs = channel(2);
  const alphas = channel(3);

  const r = median(rs);
  const g = median(gs);
  const b = median(bs);
  const a = median(alphas);

  let variance = 0;
  for (const [sr, sg, sb] of samples) {
    variance += Math.abs(sr - r) + Math.abs(sg - g) + Math.abs(sb - b);
  }
  variance /= samples.length;

  return { r, g, b, a, variance };
}

function buildForegroundMask(imageData, width, height) {
  const data = imageData.data;
  const bg = sampleBackground(data, width, height);
  const threshold = clamp(Math.round(Math.max(34, bg.variance * 1.35)), 34, 92);
  const mask = new Uint8Array(width * height);

  for (let i = 0, px = 0; i < data.length; i += 4, px++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    const diff = Math.abs(r - bg.r) + Math.abs(g - bg.g) + Math.abs(b - bg.b);
    const foreground = a > 24 && (diff > threshold || (bg.a > 220 && a < 230));
    mask[px] = foreground ? 1 : 0;
  }

  return mask;
}

function extractComponents(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const components = [];
  const queueX = new Int32Array(mask.length);
  const queueY = new Int32Array(mask.length);
  const minArea = Math.max(50, Math.round(width * height * 0.00018));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!mask[idx] || visited[idx]) continue;

      let head = 0;
      let tail = 0;
      queueX[tail] = x;
      queueY[tail] = y;
      tail++;
      visited[idx] = 1;

      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let area = 0;

      while (head < tail) {
        const cx = queueX[head];
        const cy = queueY[head];
        head++;
        area++;
        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;

        const neighbors = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1]
        ];

        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nIdx = ny * width + nx;
          if (!mask[nIdx] || visited[nIdx]) continue;
          visited[nIdx] = 1;
          queueX[tail] = nx;
          queueY[tail] = ny;
          tail++;
        }
      }

      const compWidth = maxX - minX + 1;
      const compHeight = maxY - minY + 1;
      if (area < minArea) continue;
      if (compWidth < 8 || compHeight < 8) continue;

      components.push({
        x: minX,
        y: minY,
        width: compWidth,
        height: compHeight,
        area
      });
    }
  }

  return components;
}

function expandedOverlap(a, b, marginX, marginY) {
  return !(
    a.x + a.width + marginX < b.x - marginX ||
    b.x + b.width + marginX < a.x - marginX ||
    a.y + a.height + marginY < b.y - marginY ||
    b.y + b.height + marginY < a.y - marginY
  );
}

function mergeBoxes(a, b) {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    area: (a.area || a.width * a.height) + (b.area || b.width * b.height)
  };
}

function mergeNearbyComponents(components, width, height) {
  const boxes = components
    .slice()
    .sort((a, b) => b.area - a.area)
    .map((box) => ({ ...box }));

  const marginX = Math.max(10, Math.round(width * 0.018));
  const marginY = Math.max(10, Math.round(height * 0.018));

  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (!expandedOverlap(a, b, marginX, marginY)) continue;

        const merged = mergeBoxes(a, b);
        const expandedArea = merged.width * merged.height;
        const stickersLikelySeparate = expandedArea > (a.width * a.height + b.width * b.height) * 3.2;
        if (stickersLikelySeparate) continue;

        boxes[i] = merged;
        boxes.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }

  return boxes;
}

function sortRowMajor(boxes) {
  if (!boxes.length) return boxes;
  const heights = boxes.map((b) => b.height).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 80;
  const rowTolerance = medianHeight * 0.6;

  const sorted = boxes.slice().sort((a, b) => (a.y + a.height / 2) - (b.y + b.height / 2));
  const rows = [];

  for (const box of sorted) {
    const centerY = box.y + box.height / 2;
    let row = rows.find((r) => Math.abs(r.centerY - centerY) <= rowTolerance);
    if (!row) {
      row = { centerY, boxes: [] };
      rows.push(row);
    }
    row.boxes.push(box);
    row.centerY = row.boxes.reduce((sum, item) => sum + item.y + item.height / 2, 0) / row.boxes.length;
  }

  rows.sort((a, b) => a.centerY - b.centerY);
  return rows.flatMap((row) => row.boxes.sort((a, b) => a.x - b.x));
}

export function autoDetectCropBoxesFromImage(image, options = {}) {
  if (!image?.width || !image?.height) return [];

  const maxSide = options.maxSide || 1400;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const offscreen = createOffscreen(width, height);
  const ctx = offscreen.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const mask = buildForegroundMask(imageData, width, height);
  const components = extractComponents(mask, width, height);
  if (!components.length) return [];

  let merged = mergeNearbyComponents(components, width, height);
  merged = merged.filter((box) => box.width >= 24 && box.height >= 24);

  const maxBoxes = options.maxBoxes || 48;
  if (merged.length > maxBoxes) {
    merged = merged
      .sort((a, b) => b.width * b.height - a.width * a.height)
      .slice(0, maxBoxes);
  }

  const padding = Math.max(8, Math.round(Math.min(width, height) * 0.012));
  const inverseScale = 1 / scale;

  return sortRowMajor(merged).map((box, index) => {
    const x = clamp((box.x - padding) * inverseScale, 0, image.width);
    const y = clamp((box.y - padding) * inverseScale, 0, image.height);
    const right = clamp((box.x + box.width + padding) * inverseScale, 0, image.width);
    const bottom = clamp((box.y + box.height + padding) * inverseScale, 0, image.height);

    return {
      x,
      y,
      width: Math.max(24, right - x),
      height: Math.max(24, bottom - y),
      rotation: 0,
      visible: true,
      locked: false,
      opacity: 1,
      name: `Crop ${index + 1}`
    };
  });
}
