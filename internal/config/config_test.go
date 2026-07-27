package config

import (
	"os"
	"path/filepath"
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
