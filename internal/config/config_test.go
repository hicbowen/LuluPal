package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStoreAndMigration(t *testing.T) {
	p := filepath.Join(t.TempDir(), "config.json")
	s := NewStore(p)
	v := Default()
	v.TargetDate = "2026-12-31"
	v.Version = 0
	if err := s.Save(v); err != nil {
		t.Fatal(err)
	}
	got, err := NewStore(p).Load()
	if err != nil {
		t.Fatal(err)
	}
	if got.Version != CurrentVersion || got.TargetDate != v.TargetDate {
		t.Fatalf("%+v", got)
	}
}

func TestMigrateLegacyFileCopiesExistingConfig(t *testing.T) {
	root := t.TempDir()
	legacyPath := filepath.Join(root, "LuluDay", "config.json")
	currentPath := filepath.Join(root, "LuluPal", "config.json")
	raw := []byte(`{"version":8,"targetDate":"2027-01-01"}`)
	if err := os.MkdirAll(filepath.Dir(legacyPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(legacyPath, raw, 0o600); err != nil {
		t.Fatal(err)
	}

	migrated, err := MigrateLegacyFile(legacyPath, currentPath)
	if err != nil {
		t.Fatal(err)
	}
	if !migrated {
		t.Fatal("expected legacy config to be migrated")
	}
	got, err := os.ReadFile(currentPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(raw) {
		t.Fatalf("migrated config = %q, want %q", got, raw)
	}
	if _, err := os.Stat(legacyPath); err != nil {
		t.Fatalf("legacy config should be preserved: %v", err)
	}
}

func TestMigrateLegacyFileDoesNotOverwriteCurrentConfig(t *testing.T) {
	root := t.TempDir()
	legacyPath := filepath.Join(root, "LuluDay", "config.json")
	currentPath := filepath.Join(root, "LuluPal", "config.json")
	for path, raw := range map[string][]byte{
		legacyPath:  []byte(`{"source":"legacy"}`),
		currentPath: []byte(`{"source":"current"}`),
	} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, raw, 0o600); err != nil {
			t.Fatal(err)
		}
	}

	migrated, err := MigrateLegacyFile(legacyPath, currentPath)
	if err != nil {
		t.Fatal(err)
	}
	if migrated {
		t.Fatal("existing current config should not be overwritten")
	}
	got, err := os.ReadFile(currentPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != `{"source":"current"}` {
		t.Fatalf("current config was changed: %q", got)
	}
}

func TestMigrateLegacyFileWithoutLegacyConfigIsNoOp(t *testing.T) {
	root := t.TempDir()
	migrated, err := MigrateLegacyFile(
		filepath.Join(root, "LuluDay", "config.json"),
		filepath.Join(root, "LuluPal", "config.json"),
	)
	if err != nil {
		t.Fatal(err)
	}
	if migrated {
		t.Fatal("missing legacy config should be a no-op")
	}
}

func TestVersionOneConfigGetsDefaultWeekendRestDays(t *testing.T) {
	p := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(p, []byte(`{"version":1,"countdownMode":"workday","petScale":1}`), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := NewStore(p).Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(got.RestWeekdays) != 2 || got.RestWeekdays[0] != 0 || got.RestWeekdays[1] != 6 {
		t.Fatalf("rest weekdays = %v, want [0 6]", got.RestWeekdays)
	}
}

func TestVersionTwoConfigGetsDefaultActivityArea(t *testing.T) {
	p := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(p, []byte(`{"version":2,"countdownMode":"calendar","petScale":1}`), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := NewStore(p).Load()
	if err != nil {
		t.Fatal(err)
	}
	if got.ActivityArea != "bottom" || got.BottomMargin != 12 {
		t.Fatalf("activity area = %q, margin = %d", got.ActivityArea, got.BottomMargin)
	}
}

func TestVersionThreeConfigGetsDefaultBubbleCategories(t *testing.T) {
	p := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(p, []byte(`{"version":3,"countdownMode":"calendar","petScale":1,"activityArea":"bottom"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := NewStore(p).Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(got.BubbleCategories) != 9 || !got.BubbleCategories["countdown"] || !got.BubbleCategories["petting"] {
		t.Fatalf("bubble categories = %v", got.BubbleCategories)
	}
}

func TestVersionFourConfigGetsLongerDefaultSleep(t *testing.T) {
	p := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(p, []byte(`{"version":4,"countdownMode":"calendar","petScale":1,"activityArea":"bottom"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := NewStore(p).Load()
	if err != nil {
		t.Fatal(err)
	}
	if got.SleepDurationSeconds != 30 {
		t.Fatalf("sleep duration = %d, want 30", got.SleepDurationSeconds)
	}
}

func TestVersionFiveConfigGetsHealthReminderDefaults(t *testing.T) {
	p := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(p, []byte(`{"version":5,"countdownMode":"calendar","petScale":1,"activityArea":"bottom","sleepDurationSeconds":30}`), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := NewStore(p).Load()
	if err != nil {
		t.Fatal(err)
	}
	if !got.HealthReminders.Enabled || !got.HealthReminders.WaterEnabled || got.HealthReminders.WaterIntervalMinutes != 60 {
		t.Fatalf("health reminders = %+v", got.HealthReminders)
	}
}

func TestVersionSixConfigEnablesSPlayerByDefault(t *testing.T) {
	p := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(p, []byte(`{"version":6,"countdownMode":"calendar","petScale":1,"activityArea":"bottom","sleepDurationSeconds":30}`), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := NewStore(p).Load()
	if err != nil {
		t.Fatal(err)
	}
	if !got.SPlayerEnabled {
		t.Fatal("SPlayer should be enabled when migrating an existing config")
	}
}

func TestDisabledSPlayerSettingIsPreserved(t *testing.T) {
	p := filepath.Join(t.TempDir(), "config.json")
	s := NewStore(p)
	v := Default()
	v.SPlayerEnabled = false
	if err := s.Save(v); err != nil {
		t.Fatal(err)
	}
	got, err := NewStore(p).Load()
	if err != nil {
		t.Fatal(err)
	}
	if got.SPlayerEnabled {
		t.Fatal("disabled SPlayer setting should be preserved")
	}
}

func TestVersionSevenConfigGetsEmptyCustomMessages(t *testing.T) {
	p := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(p, []byte(`{"version":7,"countdownMode":"calendar","petScale":1,"activityArea":"bottom","sleepDurationSeconds":30}`), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := NewStore(p).Load()
	if err != nil {
		t.Fatal(err)
	}
	if got.CustomMessages == nil || len(got.CustomMessages) != 0 {
		t.Fatalf("custom messages = %v, want empty map", got.CustomMessages)
	}
}

func TestCustomMessagesArePreservedAndSanitised(t *testing.T) {
	p := filepath.Join(t.TempDir(), "config.json")
	s := NewStore(p)
	v := Default()
	v.CustomMessages = map[string]string{
		"click-here":   "  今天也要开心  ",
		"empty":        "   ",
		"long-message": strings.Repeat("噜", 181),
	}
	if err := s.Save(v); err != nil {
		t.Fatal(err)
	}
	got, err := NewStore(p).Load()
	if err != nil {
		t.Fatal(err)
	}
	if got.CustomMessages["click-here"] != "今天也要开心" {
		t.Fatalf("custom click message = %q", got.CustomMessages["click-here"])
	}
	if _, exists := got.CustomMessages["empty"]; exists {
		t.Fatal("blank custom message should fall back to the default")
	}
	if len([]rune(got.CustomMessages["long-message"])) != 180 {
		t.Fatalf("long custom message length = %d, want 180", len([]rune(got.CustomMessages["long-message"])))
	}
}

func TestCorruptBackup(t *testing.T) {
	p := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(p, []byte("{broken"), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := NewStore(p).Load()
	if err != nil {
		t.Fatal(err)
	}
	if got.Version != CurrentVersion {
		t.Fatalf("%+v", got)
	}
	if _, err = os.Stat(p + ".corrupt"); err != nil {
		t.Fatal(err)
	}
}
