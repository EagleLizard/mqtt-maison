package mqttezd

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"

	"github.com/EagleLizard/mqtt-maison/src/lib/config"
	mqtt "github.com/eclipse/paho.mqtt.golang"
)

const z2m_prefix = "zigbee2mqtt"
const ikea_remote_name = "symfonisk_remote"
const z2m_device_target = "croc"

type MsgEvt struct {
	Topic   string
	Payload []byte
}

type MqttCtx struct {
	Client mqtt.Client
}

func MqttEzdMain() {
	fmt.Printf("mqttezd main ~\n")
	c := initClient()
	if t := c.Connect(); t.Wait() && t.Error() != nil {
		panic(t.Error())
	}
	msgCh := make(chan MsgEvt)
	actionTopic := fmt.Sprintf("%s/%s/action", z2m_prefix, ikea_remote_name)
	fn := func(client mqtt.Client, msg mqtt.Message) {
		msgEvt := MsgEvt{msg.Topic(), msg.Payload()}
		msgCh <- msgEvt
	}
	if t := c.Subscribe(actionTopic, 0, fn); t.Wait() && t.Error() != nil {
		panic(t.Error())
	}
	doneCh := make(chan struct{})
	ctx := MqttCtx{
		Client: c,
	}
	go func() {
		receivedCount := 0
		for msg := range msgCh {
			fmt.Printf("action msg handler: topic: %s\n", msg.Topic)
			ikeaMsgHandler(ctx, msg)
			receivedCount++
		}
		doneCh <- struct{}{}
	}()
	<-doneCh
}

type Z2mBinaryState struct {
	State string `json:"state"`
}

func ikeaMsgHandler(ctx MqttCtx, evt MsgEvt) {
	payloadStr := string(evt.Payload)
	if payloadStr == "toggle" {
		deviceTopic := z2m_prefix + "/" + z2m_device_target
		deviceGetPayload := Z2mBinaryState{
			State: "",
		}
		deviceStateMsgCh := make(chan mqtt.Message)
		/* subscribe once */
		ctx.Client.Subscribe(deviceTopic, 0, func(c mqtt.Client, m mqtt.Message) {
			defer func() {
				ctx.Client.Unsubscribe(deviceTopic)
			}()
			// fmt.Printf("topic: %s\n", m.Topic())
			// fmt.Printf("payload: %s\n", string(m.Payload()))
			deviceStateMsgCh <- m
		})
		deviceGetTopic := deviceTopic + "/get"
		deviceGetPayloadStr, err := json.Marshal(deviceGetPayload)
		if err != nil {
			panic(err)
		}
		ctx.Client.Publish(deviceGetTopic, 0, false, deviceGetPayloadStr)
		deviceStateMsg := <-deviceStateMsgCh
		currDeviceState := Z2mBinaryState{}
		err = json.Unmarshal(deviceStateMsg.Payload(), &currDeviceState)
		if err != nil {
			panic(err)
		}
		var stateVal string
		switch currDeviceState.State {
		case "ON":
			stateVal = "OFF"
		case "OFF":
			stateVal = "ON"
		default:
			stateVal = "TOGGLE"
		}
		targetDevicePayload := Z2mBinaryState{
			State: stateVal,
		}
		targetPayload, err := json.Marshal(targetDevicePayload)
		if err != nil {
			panic(err)
		}
		targetTopic := deviceTopic + "/set"
		fmt.Printf("targetTopic: %s\n", targetTopic)
		fmt.Printf("targetPayload: %s\n", targetPayload)
		ctx.Client.Publish(targetTopic, 0, false, targetPayload)
	}
}

func initClient() mqtt.Client {
	cfg, err := config.GetMqttConfig()
	if err != nil {
		panic(err)
	}
	mqtt.ERROR = slog.NewLogLogger(slog.NewJSONHandler(os.Stdout, nil), slog.LevelError)
	mqtt.CRITICAL = slog.NewLogLogger(slog.NewJSONHandler(os.Stdout, nil), slog.LevelError)
	// mqtt.WARN = slog.NewLogLogger(slog.NewJSONHandler(os.Stdout, nil), slog.LevelWarn)
	mqtt.DEBUG = slog.NewLogLogger(slog.NewJSONHandler(os.Stdout, nil), slog.LevelDebug)
	opts := mqtt.NewClientOptions()
	opts.AddBroker(cfg.Server)
	opts.SetClientID("mqtt-maison")
	opts.SetUsername(cfg.User)
	opts.SetPassword(cfg.Password)
	opts.SetOrderMatters(false)
	c := mqtt.NewClient(opts)
	return c
}
