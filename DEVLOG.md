
# Dev Log

This document is intended to keep things focused in the absence of a task management system.

The format is roughly reverse-chronological by date.

## [08/12/2025]

I have been able to diagnose several issues that I had assumed were related to my asynchronous code or MQTT, and have discovered the issues almost all have to do with flakiness in devices or `zigbee2mqtt` and related drivers itself.

1. Any messages sent to `Router` devices, in this case [Third Reality 3RSP02028BZ Plugs](https://www.zigbee2mqtt.io/devices/3RSP02028BZ.html#third%2520reality-3rsp02028bz), have a higher chance of failing in a way that causes a retry.
    1. This includes, but is not limited to, the errors of type: `zh:ember:ezsp: Received network/route error ROUTE_ERROR_MANY_TO_ONE_ROUTE_FAILURE`
    1. _Sometimes the retry is delayed by several minutes_ - this is extremely frustrating!
1. If a `Router` switch fails _while it is routing a message from an end device_, like the Ikea remote, it will _sometimes_ re-send the signal from the remote again.
    1. This causes cascading errors sometimes if the message modifies the switch state and the same switch is part of the route the message is traveling on.

## [08/02/2025]

I adding a sqlite database. Why am I adding a sqlite database? I have either lost sight of the vision or never had one. Until I can answer the question, I will not worry about it.

## [07/28/2025]

Encountered a new error today in zigbee2mqtt:

```
zh:ember:ezsp: Received network/route error ROUTE_ERROR_NON_TREE_LINK_FAILURE for "21467".
```

## [07/27/2025]

The idea to subscribe to device states (from 07/23/2025) at program start is a noticeable improvement. The logic to wait for the state is a lot simpler, even though it's still a bit hacky - I'm polling the device service instead of registering a new `msgRouter` sub handler.

### Device state polling improvement (todo / future)

The logic for waiting for the state to change to the desired state is to sleep and check for a new message in a while loop. The new message may or may not have the desired state.

This works well enough, but could be improved - if I could call a function on `z2m-device-service` that only resolves *when a new message is received*, could use that instead, and it would be slightly better.

### Update on Queueing Actions

I wrote an async queue for handling the the messages one at a time. This doesn't work great in practice, because the expectations I have as a user pressing buttons on a physical device are:

1. changes should happen quickly after pressing a button (fast feedback)
1. subsequent button presses are:
    1. due to misclicks, e.g. "Did I actually click the button last time I pressed it?"
    1. not relevant in rapid succession, because I as a user don't know if I pressed the same button 9 or 10 times

Essentially, maintaining actions in a queue isn't relevant in this context and is annoying when there is zigbee2mqtt latency, because queued messages end up processing slowly and unpredictably.

Instead of a queue, I think it would be a better UX if:

1. An action is expected to complete in a certain amount of time - either succeed, or fail with a timeout
1. For most actions, like toggling, if a new action happens while one is in progress, we can ignore the new one while we wait for the current to succeed / fail.
    1. The expectation may be different for different actions, like changing to next / prev. In that case, it may be better for 2 clicks to be queued instead, e.g. clicking "next" 3 times to go to cycle forward 3 modes.

## [07/23/2025]

I think that the idea of getting device states ad-hoc, meaning subscribing to get the state and then unsubscribing when we get the state, may not be a great approach given z2m network instability / latency.

It may be better to subscribe to all relevant devices on *program start* or *mode change*, and maintain the latest device state that was broadcast. That way, any request to change state that depends on the current state can execute immediately.

## [07/22/2025]

I think I've figured out a way to reliably timeout and unsub when the `z2m/device/get` message times out. It should also work if a device isn't broadcasting its state. It's a bit crude (polling with `setTimeout`), but seems to work in most cases.

This has been a pain in the ass. As far as I can tell, the issue is with the zigbee2mqtt implementation rather than some misconfiguration of my network or MQTT broker. It may have something to do with the ember/ezsp firmware (based on logs I see containing `zh:ember:ezsp:`).

I *think* `ember` is relatively new in the stack, and I don't recall having issues before its introduction.

On the bright side, this handles a general case when using something like MQTT to interface with physical devices; there could always be instances where a device is not reachable.

## [07/21/2025]

I'm working around an error case in zigbee2mqtt where a `z2m/device/set` message is published successfully, but zigbee2mqtt fails to send the message to the actual device. This is the same issue as [this github issue for "Error: ZCL command genOnOff.on"](https://github.com/Koenkk/zigbee2mqtt/issues/24375).

I think this is an issue with the actual zigbee2mqtt firmware, however I can't find clear solutions / explanations about this specific issue, so it's possible it's signal interference or a hardware problem with my main coordinator.

## [07/20/2025]

It may make more sense to use NodeJS's [native EventEmitter](https://nodejs.org/docs/latest/api/events.html#class-eventemitter) instead of my own EventRegistry class.

## [07/16/2025]

I am thinking that the action modes might benefit from having a different interface.

It may also be more important than I thought before to process remote control actions in a queue. During testing there are some synchronicity problems that make me think that there are several async message handlers hanging on a single promise. For example, several toggles may be processed for a single device but not the other. Then, several seconds later, the other devices toggles on / off several times in quick succession.

## [07/15/2025]

### Modal Control feature notes

Potential improvements:

1. Perform some action when switching modes
    1. Optional, async. `.onSelect()` or similar.
    2. Use-case: single-device LED light controls could "blink" on select
2. Reset to default mode after some period of inactivity
    1. If no message received on the custom topic (i.e. from the ikea remote adapter) for some time (e.g. 30s), reset mode to default

## [07/13/2025]

### Update 1 - follow up

To follow up on the update from yesterday, I do want to make the client work with the same ergonomics I have in the typescript implementation. Primarily:

1. When a topic is subscribed to: keep track of the handler (callback) in a central registry
2. When a tracked handler is de-registered: remove it from the list of tracked handlers
    1. If there are no more handlers registered for the topics, unsubscribe from the topic in the underlying golang paho.mqtt client

I will hold off on implementing this in the golang client for now in order to prioritize current work in the typescript client as it is farther along at this point.

The motivation for switching to golang is the memory footprint - the target runtime has constrained memory and cpu requirements.

## [07/12/2025]

### Update 1

I'd like to spend some time on the golang implementation to get it closer to where the typescript implementation is currently.

### Typescript MQTT Client

I have a couple of directions I want to go with this right now:

1. Handle incoming messages one at a time (queue)
2. Implement modal interface with next/prev

I am leaning toward 2 right now. Implementing the modal interface would make it more immediately useful, and it would have parity with the previous workflow in Node-RED.

Doing 1 is more interesting, but there are reasons not to do it right this second. Primarily, the code is still pretty tightly coupled and I like the flexibility I have right now to change implementations. I've rewritten the subscription adapters and publishing several times without much friction.

1 is a much better candidate once the interfaces are more mature. This way, I'll avoid locking myself into the current design.

### Golang MQTT Client

The ergonomic benefits of the golang library I was using are not as comprehensive as I thought - subscribing to a single topic with a single handler is nice, but it doesn't handle unsubscriptions gracefully in scenarios where multiple subscriptions and unsubscriptions can happen in different parts of the program simultaneously.

Something similar to track what events are registered to which topics, similar to that I did in the typescript client, would be needed for it to behave like I want.

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