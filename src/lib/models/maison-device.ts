
export type MaisonDevice = {
  /*
    Currently I'll target just the binary state features of devices,
      which are available on switches and lights.
    I want to extend this to include device-specific features,
      e.g. brightness, color for lights
  */
  name: string; // friendly_name
} & {};
