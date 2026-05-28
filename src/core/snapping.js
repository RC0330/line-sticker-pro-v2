export function snap(value, target) {

  const threshold = 10;

  if (
    Math.abs(value - target) <
    threshold
  ) {
    return target;
  }

  return value;
}