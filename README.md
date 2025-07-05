
# MQTT Maison

This is a project to replace some MQTT-based Node-RED automations which required custom scripts to glue different workflow steps together.

I think it will be more clear to write the automations as scripts directly.

Follows experiments in https://github.com/EagleLizard/julius-ezd-2025

## Device Action Adapter

The script will listen for action messages from a device and adapt them to actions recognizable to my smart home setup.

Currently the source device is an [IKEA Symfonisk sound remote, gen 2](https://www.zigbee2mqtt.io/devices/E2123.html#ikea-e2123). I bought this device because of the number of actions it exposes on a single remote relative to alternatives.

### Modal Actions

In order to provide fine-grained control over different types of devices, the remote uses two of its buttons to control the *mode* of the controls.

For example, the track seek forward / back buttons can cycle through the modes. There are modes mapped to individual RGB LED lights, and when each mode is selected the light will blink (toggle) on and off 3 times to visually indicate it is selected.

1. Another button on the remote, e.g. the `single-dot` button, can be pressed to identify the selected device (mode) by blinking again.
2. Depending on the selected device, the other buttons on the remote can be mapped to mode-specific actions:
    1. An RGB light can be dimmed by some amount (e.g. +/-10%) by clicking the `plus` or `minus` buttons on the remote
    2. A device can be toggled on or off by pressing double dots
3. The `play` (middle) button currently doesn't change based on the mode - it will always toggle specific devices on or off, like lamps or spotlights.

`TODO`: map these out in a diagram and / or table

