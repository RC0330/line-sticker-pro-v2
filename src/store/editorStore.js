export const editorStore = {

  image: null,

  boxes: [],

  selected: [],

  zoom: 1,

  panX: 0,
  panY: 0,

  viewInitialized: false,

  viewPanMode: false,

  nudgeStep: 1,

  mobileMultiSelectMode: false,

  deleteButtonBox: -1,

  deleteButtonHighlightUntil: 0,

  dragging: false,

  resizing: false,

  selecting: false,

  activeBox: -1,

  hoverBox: -1,

  selectionRect: null,

  history: [],

  historyIndex: -1,

  guides: [],

  transformMode: false,

  transformHandle: null,

  resizeHandle: null,

  transformBounds: null,

  exportOptions: {
    removeBackground: true,
    tolerance: 34,
    feather: 8,
    scale: 1,
    preset: "scale1",
    margin: 0,
    filenamePrefix: "sticker"
  },

  bgTolerance: 34,
  bgFeather: 8,

  gridTemplate: {
    active: false,
    columns: 0,
    rows: 0,
    verticalLines: [],
    horizontalLines: []
  },

  appVersion: "v39-batch-lock-opacity"
};