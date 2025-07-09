
# Dev Log

This document is intended to keep things focused in the absence of a task management system.

The format is roughly reverse-chronological by date.

## [07/08/2025]

I've implemented some basic toggling functionality for devices with binary state in Typescript.

Currently, many messages can be fired in quick succession and send multiple simultaneous `TOGGLE` messages. I am testing with multiple devices, and I can get the devices out of sync by starting with them all in the same state and pressing the toggle button rapidly.

This is to be expected because:

1. By default MQTT messages are fire-and-forget; there's no handshake that verifies the message was received.
    1. I'm wondering if this is something that I can fix by setting the `qos` value to `1` or `2` (default is `0`), or some other mechanism built into the MQTT protocol or broker
2. The script doesn't track the current state of a device, nor does it sync device state when multiple devices are being toggled.
3. The script doesn't track if any actions are in-flight or not before sending the next message.
    1. This could be solved by doing something like a `debounce` to prevent messages from sending before a previous action completes. I could track if an action is in-flight with a mutex-like struct.
    2. A queue could work if I can track when an action has successfully finished (e.g. messages delivered / devices reached desired state). This would theoretically prevent the case where multiple devices become out of sync.

Note: I plan on solving this at an application-level first, but this would need to be implemented with a shared DB or similar if I ever have multiple instances running.

## [07/07/2025]

I've written the same basic functionality in JS (TS) and Golang. The abstractions are not 1:1, but they could be. Currently I like the control and ergonomics I have in JS.

The current state is a good proof-of-concept, but it doesn't match what I had designed. Currently the message handling works like so:
```
SUB z2m/remote/action
  "toggle" -> PUB z2m/target/set {state: 'toggle'}
  ...
```

This works fine for the current case where the target is a binary switch that exposes a `toggle` action, but this may not always be the case. I may need to poll for the device state via a `/get` zigbee2mqtt topic, homeassistant API, etc.

There are some additional asynchronous quirks with the ikea symfonisk remote that I want ot handle gracefully. This may be the case with other remotes. A general example is simulating a `double_press` event - in this case a single-press only happens if it is not followed by another single-press event within a certain time window.

With the ikea remote, there are several types of button presses that correspond to 2 or more MQTT events, described on the [IKEA symfonisk remote gen 2 device page](https://www.zigbee2mqtt.io/devices/E2123.html#notes-on-firmware-1-0-32-20221219).

To handle this gracefully and present a useful layer of abstraction, I think creating a new MQTT topic and converting device-specific topics to specific messages on this topic makes sense.

To do this I will split the current setup into two listeners:

```
SUB z2m/remote/action
  "toggle" -> PUB ezd/etc {action: 'toggle'}

SUB ezd/etc
  "toggle" -> PUB z2m/target/set {state: 'toggle'}
```

or something like that.