package mqttezd

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/EagleLizard/mqtt-maison/src/lib/config"
	"github.com/EagleLizard/mqtt-maison/src/lib/events"
	ezdargs "github.com/EagleLizard/mqtt-maison/src/lib/ezd-args"
	maisonaction "github.com/EagleLizard/mqtt-maison/src/lib/models/maison-action"
	mqtt "github.com/eclipse/paho.mqtt.golang"
)

/* modified time.RFC3339Nano to match expected decimal precision in ms _*/
const ISO8601_FORMAT = "2006-01-02T15:04:05.999Z07:00"

/* TODO: make these configurable */
const z2m_prefix = "zigbee2mqtt"
const ikea_remote_name = "symfonisk_remote"
const z2m_device_target = "croc"

const maison_topic_prefix = "ezd"
const maison_action_topic = "rmt_ctrl"

type MsgEvt struct {
	Topic   string
	Payload []byte
}

type MqttCtx struct {
	Client mqtt.Client
	Logger *slog.Logger
}

func MqttEzdMain(args ezdargs.EzdArgs) {
	fmt.Printf("mqttezd main ~\n")
	fmt.Printf("args.Rest: %v\n", args.Rest)

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
	/* if nothing is passed */
	c := initClient()
	if t := c.Connect(); t.Wait() && t.Error() != nil {
		panic(t.Error())
	}
	ikeaDoneCh := make(chan struct{})
	ctx := MqttCtx{
		Client: c,
		Logger: slog.New(slog.NewJSONHandler(os.Stdout, nil)),
	}
	/* target device listener for debugging _*/
	deviceTargetMsgCh := make(chan MsgEvt)
	deviceTargetDoneCh := make(chan struct{})

	go func() {
		for msg := range deviceTargetMsgCh {
			/* This wont fire if unsubscribed elsewhere.. */
			fmt.Printf("%s\n", msg.Topic)
		}
		deviceTargetDoneCh <- struct{}{}
	}()
	maisonDoneCh := make(chan struct{})
	// subMaisonActions(ctx, c, maisonDoneCh)
	subIkeaRemote(ctx, c, ikeaDoneCh)
	<-ikeaDoneCh
	<-deviceTargetDoneCh
	<-maisonDoneCh
}

type IkeaRemotePayload struct {
	Action string `json:"action"`
}

type MaisonActionPayload struct {
	Action string `json:"action"`
	Dob    string `json:"dob"` // ISO 8691 string
}

/*
Adapt messages from remote to our custom topic
*/
func subIkeaRemote(ctx MqttCtx, client mqtt.Client, doneCh chan struct{}) {
	msgCh := make(chan MsgEvt)
	ikeaTopic := z2m_prefix + "/" + ikea_remote_name
	fn := func(c mqtt.Client, m mqtt.Message) {
		msgCh <- MsgEvt{m.Topic(), m.Payload()}
	}
	t := client.Subscribe(ikeaTopic, 1, fn)
	<-t.Done()
	err := t.Error()
	if err != nil {
		panic(err)
	}
	go func() {
		for msg := range msgCh {
			ikeaMsgHandler(ctx, msg)
		}
		doneCh <- struct{}{}
	}()
}

func subMaisonActions(ctx MqttCtx, client mqtt.Client, doneCh chan struct{}) {
	msgCh := make(chan MsgEvt)
	// doneCh := make(chan struct{})
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
	// return doneCh
}

type Z2mBinaryState struct {
	State string `json:"state"`
}

func ikeaMsgHandler(ctx MqttCtx, msg MsgEvt) {
	ikeaRemotePayload := IkeaRemotePayload{}
	err := json.Unmarshal(msg.Payload, &ikeaRemotePayload)
	if err != nil {
		ctx.Logger.Error(msg.Topic, "error", err)
	}
	/* adapt to messages on our topic */

	fmt.Printf("%s\n", ikeaRemotePayload.Action)
	// ctx.Logger.Info("", slog.String("topic", msg.Topic), slog.String("payload", string(msg.Payload)))
	mappedAction := maisonaction.GetMappedIkeaAction(ikeaRemotePayload.Action)
	if len(mappedAction) < 1 {
		ctx.Logger.Warn(fmt.Sprintf("No mapping for action: %s", ikeaRemotePayload.Action), slog.String("topic", msg.Topic))
		return
	}

	dob := time.Now().Format("2006-01-02T15:04:05.999Z07:00")
	maisonPayload := MaisonActionPayload{
		Action: mappedAction,
		Dob:    dob,
	}
	maisonPubMsg, err := json.Marshal(maisonPayload)
	if err != nil {
		panic(err)
	}
	pubTopic := maison_topic_prefix + "/" + maison_action_topic
	t := ctx.Client.Publish(pubTopic, 0, false, maisonPubMsg)
	<-t.Done()
	if t.Error() != nil {
		ctx.Logger.Error("", "err", t.Error())
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
	mqtt.WARN = slog.NewLogLogger(slog.NewJSONHandler(os.Stdout, nil), slog.LevelWarn)
	// mqtt.DEBUG = slog.NewLogLogger(slog.NewJSONHandler(os.Stdout, nil), slog.LevelDebug)
	// mqtt.DEBUG = log.New(os.Stdout, "[DEBUG] ", 0)
	opts := mqtt.NewClientOptions()
	opts.AddBroker(cfg.Server)
	opts.SetClientID("mqtt-maison-go")
	opts.SetUsername(cfg.User)
	opts.SetPassword(cfg.Password)
	opts.SetOrderMatters(false)
	fmt.Printf("%+v\n", opts)
	c := mqtt.NewClient(opts)
	return c
}
