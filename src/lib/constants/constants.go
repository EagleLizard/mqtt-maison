package constants

import (
	"fmt"
	"path/filepath"
	"runtime"
)

const parentLvls = 4

func BaseDir() (string, error) {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		return "", fmt.Errorf("error getting base dir")
	}
	baseDir := filename
	for i := 0; i < parentLvls; i++ {
		baseDir = filepath.Dir(baseDir)
	}
	return baseDir, nil
}
