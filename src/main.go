package main

import (
	"fmt"
	"strings"

	"github.com/EagleLizard/mqtt-maison/src/cmd/etc"
	mqttezd "github.com/EagleLizard/mqtt-maison/src/cmd/mqtt-ezd"
	ezdargs "github.com/EagleLizard/mqtt-maison/src/lib/ezd-args"
)

func main() {
	ezdArgs := ezdargs.ParseArgs()
	cmdMap := ezdargs.GetCmdMap()
	switch ezdArgs.Cmd {
	case cmdMap["mqtt"]:
		mqttezd.MqttEzdMain(ezdArgs)
	case cmdMap["etc"]:
		etc.EtcMain()
	default:
		cmdStrs := []string{}
		for _, v := range cmdMap {
			cmdStrs = append(cmdStrs, v)
		}
		fmt.Printf("commands:\n")
		fmt.Printf("  %s\n", strings.Join(cmdStrs, ", "))
	}
}
