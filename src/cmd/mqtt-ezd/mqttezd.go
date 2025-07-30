package mqttezd

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"

	"github.com/EagleLizard/mqtt-maison/src/lib/config"
	"github.com/EagleLizard/mqtt-maison/src/lib/events"
	mqtt "github.com/eclipse/paho.mqtt.golang"
)

const z2m_prefix = "zigbee2mqtt"
const ikea_remote_name = "symfonisk_remote"
const z2m_device_target = "croc"

const maison_topic_prefix = "ezd"
const maison_action_topic = "etc"

type MsgEvt struct {
	Topic   string
	Payload []byte
}

type MqttCtx struct {
	Client mqtt.Client
	Logger *slog.Logger
}

func MqttEzdMain() {
	fmt.Printf("mqttezd main ~\n")

	evtReg := events.NewEventRegistry[MsgEvt]()
	off1 := evtReg.Register(func(evt MsgEvt) {
		fmt.Printf("fn1: %s\n", evt.Topic)
	})
	off2 := evtReg.Register(func(evt MsgEvt) {
		fmt.Printf("fn2: %s\n", evt.Topic)
	})
	evtReg.Fire(MsgEvt{Topic: "topic1", Payload: []byte{}})
	off1()
	evtReg.Fire(MsgEvt{Topic: "topic2", Payload: []byte{}})
	off2()
	evtReg.Fire(MsgEvt{Topic: "topic3", Payload: []byte{}})
	/*  */

	c := initClient()
	if t := c.Connect(); t.Wait() && t.Error() != nil {
		panic(t.Error())
	}
	ikeaMsgCh := make(chan MsgEvt)
	ikeaDoneCh := make(chan struct{})
	ctx := MqttCtx{
		Client: c,
		Logger: slog.New(slog.NewJSONHandler(os.Stdout, nil)),
	}
	/* target device listener for debugging _*/
	deviceTargetMsgCh := make(chan MsgEvt)
	deviceTargetDoneCh := make(chan struct{})
	go func() {
		receivedCount := 0
		for msg := range ikeaMsgCh {
			fmt.Printf("action msg handler: topic: %s\n", msg.Topic)
			ikeaMsgHandler(ctx, msg)
			receivedCount++
		}
		ikeaDoneCh <- struct{}{}
	}()
	go func() {
		for msg := range deviceTargetMsgCh {
			/* This wont fire if unsubscribed elsewhere.. */
			fmt.Printf("%s\n", msg.Topic)
		}
		deviceTargetDoneCh <- struct{}{}
	}()
	maisonDoneCh := subMaisonActions(ctx, c)
	<-ikeaDoneCh
	<-deviceTargetDoneCh
	<-maisonDoneCh
}

type MaisonActionPayload struct {
	Action string `json:"action"`
}

func subMaisonActions(ctx MqttCtx, client mqtt.Client) chan struct{} {
	msgCh := make(chan MsgEvt)
	doneCh := make(chan struct{})
	maisonTopic := maison_topic_prefix + "/" + maison_action_topic
	fn := func(c mqtt.Client, m mqtt.Message) {
		msgCh <- MsgEvt{m.Topic(), m.Payload()}
	}
	t := client.Subscribe(maisonTopic, 0, fn)
	<-t.Done()
	err := t.Error()
	if err != nil {
		panic(err)
	}
	go func() {
		for msg := range msgCh {
			maisonActionPayload := MaisonActionPayload{}
			err := json.Unmarshal(msg.Payload, &maisonActionPayload)
			if err != nil {
				ctx.Logger.Error(msg.Topic, "error", err)
				// panic(err)
			}
			ctx.Logger.Info("", slog.String("topic", msg.Topic), slog.String("payload", string(msg.Payload)))
			// slog.Info("", slog.String("topic", msg.Topic), slog.String("payload", string(msg.Payload)))
		}
		doneCh <- struct{}{}
	}()
	return doneCh
}

type Z2mBinaryState struct {
	State string `json:"state"`
}

func ikeaMsgHandler(ctx MqttCtx, evt MsgEvt) {
	payloadStr := string(evt.Payload)
	if payloadStr == "toggle" {
		currDeviceState := getBinaryState(ctx, z2m_device_target)
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
		targetTopic := z2m_prefix + "/" + z2m_device_target + "/set"
		fmt.Printf("targetTopic: %s\n", targetTopic)
		fmt.Printf("targetPayload: %s\n", targetPayload)
		ctx.Client.Publish(targetTopic, 0, false, targetPayload)
	}
}

func getBinaryState(ctx MqttCtx, deviceName string) *Z2mBinaryState {
	deviceTopic := z2m_prefix + "/" + deviceName
	deviceStateMsgCh := make(chan mqtt.Message)
	/* subscribe .once */
	ctx.Client.Subscribe(deviceTopic, 0, func(c mqtt.Client, m mqtt.Message) {
		defer ctx.Client.Unsubscribe(deviceTopic)
		deviceStateMsgCh <- m
	})
	deviceGetTopic := deviceTopic + "/get"
	deviceGetPayloadStr := "{\"state\":\"\"}"
	ctx.Client.Publish(deviceGetTopic, 0, false, deviceGetPayloadStr)
	deviceStateMsg := <-deviceStateMsgCh
	currDeviceState := Z2mBinaryState{}
	err := json.Unmarshal(deviceStateMsg.Payload(), &currDeviceState)
	if err != nil {
		panic(err)
	}
	return &currDeviceState
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
	opts.SetClientID("mqtt-maison-go")
	opts.SetUsername(cfg.User)
	opts.SetPassword(cfg.Password)
	opts.SetOrderMatters(false)
	c := mqtt.NewClient(opts)
	return c
}
