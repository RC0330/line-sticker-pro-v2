export const layers = [];

export function addLayer(box) {

  layers.push({

    ...box,

    visible: true,
    locked: false,

    name:
      `Layer ${layers.length + 1}`
  });
}