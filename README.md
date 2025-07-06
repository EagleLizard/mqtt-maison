
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

## MQTT.js

### Handling Topics with global `.on('message', cb)`

> *some development notes*

MQTT.js exposes a single `.on` for all messages from any topic.

The intent here is to write some logic to perform a toggle. For most devices, toggle isn't an action that's explicitly exposed.
In order to perform a toggle:
1. we need to publish a z2m/device/get
    1. Before sending, we subscribe to that device's topic
    2. We should ignore any messages we get until we publish our message
    3. After we publish, wait for exactly 1 message on the device topic
    4. After we get a message, assume that it has the current state, and unsubscribe from that device's topic
2. After we get the current state, we need to invert it (assuming it's a boolean toggle)
    1. The way that would make the most sense would be to await the handshake from step 1 in the function
    2. The way it's set up right now, all of the messages go through the handler in the main function. So to make step 1 awaitable, we need to create an abstraction that works with the message router / handler