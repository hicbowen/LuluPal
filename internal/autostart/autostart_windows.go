//go:build windows

package autostart

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows/registry"
)

const (
	runKey          = `Software\Microsoft\Windows\CurrentVersion\Run`
	valueName       = "LuluPal"
	legacyValueName = "LuluDay"
)

var ErrDevelopmentBuild = errors.New("开机启动仅在正式构建中可用")

func Available() bool {
	executable, err := os.Executable()
	return err == nil && !isDevelopmentExecutable(executable)
}

func Set(enabled bool) error {
	executable, err := os.Executable()
	if err != nil {
		return err
	}
	if enabled && isDevelopmentExecutable(executable) {
		return ErrDevelopmentBuild
	}
	key, err := registry.OpenKey(registry.CURRENT_USER, runKey, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer key.Close()
	if enabled {
		if err := key.SetStringValue(valueName, `"`+executable+`"`); err != nil {
			return err
		}
		return deleteValueIfPresent(key, legacyValueName)
	}
	if err := deleteValueIfPresent(key, valueName); err != nil {
		return err
	}
	return deleteValueIfPresent(key, legacyValueName)
}

func deleteValueIfPresent(key registry.Key, name string) error {
	err := key.DeleteValue(name)
	if errors.Is(err, registry.ErrNotExist) {
		return nil
	}
	return err
}

func isDevelopmentExecutable(executable string) bool {
	lower := strings.ToLower(filepath.Clean(executable))
	if strings.Contains(lower, `\go-build\`) ||
		strings.Contains(lower, `\appdata\local\temp\`) ||
		strings.Contains(lower, `\.wails\`) {
		return true
	}
	directory := filepath.Dir(executable)
	for range 5 {
		if _, err := os.Stat(filepath.Join(directory, "go.mod")); err == nil {
			return true
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			break
		}
		directory = parent
	}
	return false
}
