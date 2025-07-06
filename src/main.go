package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/EagleLizard/mqtt-maison/src/cmd/etc"
	mqttezd "github.com/EagleLizard/mqtt-maison/src/cmd/mqtt-ezd"
)

func main() {
	ezdArgs := parseArgs()
	cmdMap := getCmdMap()
	switch ezdArgs.Cmd {
	case cmdMap["mqtt"]:
		mqttezd.MqttEzdMain()
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

type EzdArgs struct {
	Cmd string
}

func parseArgs() EzdArgs {
	ezdArgs := EzdArgs{}
	args := os.Args[1:]
	var firstArg string
	if len(args) > 0 {
		firstArg = args[0]
	}
	ezdArgs.Cmd = firstArg
	return ezdArgs
}

func getCmdMap() map[string]string {
	cmdMap := map[string]string{
		"mqtt": "mqtt",
		"etc":  "etc",
		// "mis":  "match",
	}
	for k, v := range cmdMap {
		if k != v {
			panic(fmt.Errorf("%s != %s", k, v))
		}
	}
	return cmdMap
}
