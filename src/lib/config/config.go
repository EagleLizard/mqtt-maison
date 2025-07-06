package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/EagleLizard/mqtt-maison/src/lib/constants"
	"github.com/joho/godotenv"
)

type MqttConfig struct {
	Server   string
	User     string
	Password string
}

const mqtt_server_key = "mqtt_server"
const mqtt_user_key = "mqtt_user"
const mqtt_password_key = "mqtt_password"

var mqtt_required_keys = [...]string{
	mqtt_server_key,
	mqtt_user_key,
	mqtt_password_key,
}

func init() {
	baseDir, err := constants.BaseDir()
	if err != nil {
		panic(err)
	}
	// fmt.Printf("baseDir: %s\n", baseDir)
	dotenvFilePath := filepath.Join(baseDir, ".env")
	err = godotenv.Load(dotenvFilePath)
	if err != nil {
		panic(err)
	}
}

func GetMqttConfig() (MqttConfig, error) {
	cfg := MqttConfig{}
	err := checkRequiredKeys(mqtt_required_keys[:])
	if err != nil {
		return cfg, err
	}
	cfg.Server = os.Getenv(mqtt_server_key)
	cfg.User = os.Getenv(mqtt_user_key)
	cfg.Password = os.Getenv(mqtt_password_key)
	return cfg, nil
}

func checkRequiredKeys(requiredKeys []string) error {
	missingEnvKeys := []string{}
	for _, rk := range requiredKeys {
		envVal := os.Getenv(rk)
		if len(envVal) < 1 {
			missingEnvKeys = append(missingEnvKeys, rk)
		}
	}
	if len(missingEnvKeys) > 0 {
		return fmt.Errorf("missing env vars: %s", strings.Join(missingEnvKeys, ", "))
	}
	return nil
}
