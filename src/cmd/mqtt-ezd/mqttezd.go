package mqttezd

import (
	"fmt"
	"log/slog"
	"os"

	"github.com/EagleLizard/mqtt-maison/src/lib/config"
	mqtt "github.com/eclipse/paho.mqtt.golang"
)

const z2m_prefix = "zigbee2mqtt"
const ikea_remote_name = "symfonisk_remote"
const z2m_device_target = "croc"

func MqttEzdMain() {
	fmt.Printf("mqttezd main ~\n")
	c := initClient()
	if t := c.Connect(); t.Wait() && t.Error() != nil {
		panic(t.Error())
	}
	msgCh := make(chan [2]string)
	actionTopic := fmt.Sprintf("%s/%s/action", z2m_prefix, ikea_remote_name)
	fn := func(client mqtt.Client, msg mqtt.Message) {
		msgCh <- [2]string{msg.Topic(), string(msg.Payload())}
	}
	if t := c.Subscribe(actionTopic, 0, fn); t.Wait() && t.Error() != nil {
		panic(t.Error())
	}
	doneCh := make(chan struct{})
	go func() {
		receivedCount := 0
		for msg := range msgCh {
			fmt.Printf("topic: %s\n", msg[0])
			receivedCount++
		}
		doneCh <- struct{}{}
	}()
	<-doneCh
}

func initClient() mqtt.Client {
	cfg, err := config.GetMqttConfig()
	if err != nil {
		panic(err)
	}
	mqtt.ERROR = slog.NewLogLogger(slog.NewJSONHandler(os.Stdout, nil), slog.LevelError)
	mqtt.CRITICAL = slog.NewLogLogger(slog.NewJSONHandler(os.Stdout, nil), slog.LevelError)
	mqtt.WARN = slog.NewLogLogger(slog.NewJSONHandler(os.Stdout, nil), slog.LevelWarn)
	mqtt.DEBUG = slog.NewLogLogger(slog.NewJSONHandler(os.Stdout, nil), slog.LevelDebug)
	opts := mqtt.NewClientOptions()
	opts.AddBroker(cfg.Server)
	opts.SetClientID("mqtt-maison")
	opts.SetUsername(cfg.User)
	opts.SetPassword(cfg.Password)
	c := mqtt.NewClient(opts)
	return c
}
