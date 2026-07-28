//go:build windows

package autostart

import "testing"

func TestDevelopmentExecutableDetection(t *testing.T) {
	tests := []struct {
		path string
		want bool
	}{
		{`C:\Users\me\AppData\Local\Temp\wails\LuluPal.exe`, true},
		{`C:\Users\me\AppData\Local\go-build\123\LuluPal.exe`, true},
		{`C:\Program Files\LuluPal\LuluPal.exe`, false},
	}
	for _, test := range tests {
		if got := isDevelopmentExecutable(test.path); got != test.want {
			t.Fatalf("isDevelopmentExecutable(%q) = %v, want %v", test.path, got, test.want)
		}
	}
}
