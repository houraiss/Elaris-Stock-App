// Quick-select convenience only — French/Moroccan ring sizing (inner
// circumference in mm). Any custom label is still accepted; this just saves
// typing for the common range.
export const RING_SIZE_PRESETS: string[] = Array.from({ length: 70 - 46 + 1 }, (_, i) =>
  String(46 + i),
);
