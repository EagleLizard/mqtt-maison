package ezdargs

import (
	"fmt"
	"os"
)

type EzdArgs struct {
	Cmd  string
	Rest []string
}

func ParseArgs() EzdArgs {
	ezdArgs := EzdArgs{}
	args := os.Args[1:]
	var firstArg string
	rest := []string{}
	if len(args) > 0 {
		firstArg = args[0]
	}
	if len(args) > 1 {
		rest = args[1:]
	}
	ezdArgs.Cmd = firstArg
	ezdArgs.Rest = rest
	return ezdArgs
}

func GetCmdMap() map[string]string {
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
