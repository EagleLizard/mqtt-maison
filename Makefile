
GO_BIN_DIR = bin

GO_SRC_DIR = src
GO_BIN = mqtt_maison

build-go:
	go build -o $(GO_BIN_DIR)/$(GO_BIN) $(GO_SRC_DIR)/main.go
run-go:
	$(GO_BIN_DIR)/$(GO_BIN) mqtt
run-go-adapt:
	$(GO_BIN_DIR)/$(GO_BIN) mqtt adapt
watch-go:
	air --build.cmd "make build-go" --build.bin "make run-go"
