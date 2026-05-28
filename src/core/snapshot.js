export function cloneState(
  state
) {

  return JSON.parse(
    JSON.stringify(state)
  );
}