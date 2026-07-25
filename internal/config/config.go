package config

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
)

const CurrentVersion = 5

type QuietHours struct {
	Enabled bool   `json:"enabled"`
	Start   string `json:"start"`
	End     string `json:"end"`
}
type Position struct {
	DisplayID string `json:"displayId"`
	X         int    `json:"x"`
	Y         int    `json:"y"`
}
type Config struct {
	Version              int             `json:"version"`
	TargetDate           string          `json:"targetDate"`
	CountdownMode        string          `json:"countdownMode"`
	RestWeekdays         []int           `json:"restWeekdays"`
	IncludeToday         bool            `json:"includeToday"`
	IncludeTargetDate    bool            `json:"includeTargetDate"`
	PetScale             float64         `json:"petScale"`
	ActivityArea         string          `json:"activityArea"`
	BottomMargin         int             `json:"bottomMargin"`
	SleepDurationSeconds int             `json:"sleepDurationSeconds"`
	AlwaysOnTop          bool            `json:"alwaysOnTop"`
	LaunchAtStartup      bool            `json:"launchAtStartup"`
	BubbleEnabled        bool            `json:"bubbleEnabled"`
	BubbleIntervalMin    int             `json:"bubbleIntervalMin"`
	BubbleIntervalMax    int             `json:"bubbleIntervalMax"`
	BubbleDisplaySeconds int             `json:"bubbleDisplaySeconds"`
	BubbleCategories     map[string]bool `json:"bubbleCategories"`
	QuietHours           QuietHours      `json:"quietHours"`
	Position             Position        `json:"position"`
}

func Default() Config {
	return Config{Version: CurrentVersion, CountdownMode: "calendar", RestWeekdays: []int{0, 6}, IncludeTargetDate: true, PetScale: 1, ActivityArea: "bottom", BottomMargin: 12, SleepDurationSeconds: 30, AlwaysOnTop: true, BubbleEnabled: true, BubbleIntervalMin: 20, BubbleIntervalMax: 45, BubbleDisplaySeconds: 7, BubbleCategories: defaultBubbleCategories(), QuietHours: QuietHours{Enabled: true, Start: "22:00", End: "08:00"}}
}

func defaultBubbleCategories() map[string]bool {
	return map[string]bool{
		"countdown": true, "work": true, "morning": true, "lunch": true,
		"evening": true, "petting": true, "click": true, "sleep": true, "special": true,
	}
}

type Store struct {
	path string
	mu   sync.RWMutex
	data Config
}

func NewStore(path string) *Store { return &Store{path: path, data: Default()} }
func (s *Store) Load() (Config, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	raw, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return s.data, nil
	}
	if err != nil {
		return s.data, err
	}
	var v Config
	if err = json.Unmarshal(raw, &v); err != nil {
		_ = os.Rename(s.path, s.path+".corrupt")
		s.data = Default()
		return s.data, s.saveLocked()
	}
	s.data = migrate(v)
	return s.data, nil
}
func (s *Store) Get() Config { s.mu.RLock(); defer s.mu.RUnlock(); return s.data }
func (s *Store) Save(v Config) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data = migrate(v)
	return s.saveLocked()
}
func (s *Store) saveLocked() error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err = os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}
func migrate(v Config) Config {
	d := Default()
	oldVersion := v.Version
	v.Version = CurrentVersion
	if v.CountdownMode == "" {
		v.CountdownMode = d.CountdownMode
	}
	if v.PetScale <= 0 {
		v.PetScale = d.PetScale
	}
	if v.PetScale < 0.3 {
		v.PetScale = 0.3
	}
	if v.PetScale > 1.3 {
		v.PetScale = 1.3
	}
	if v.BubbleIntervalMin <= 0 {
		v.BubbleIntervalMin = d.BubbleIntervalMin
	}
	if v.BubbleIntervalMax < v.BubbleIntervalMin {
		v.BubbleIntervalMax = v.BubbleIntervalMin
	}
	if v.BubbleDisplaySeconds <= 0 {
		v.BubbleDisplaySeconds = d.BubbleDisplaySeconds
	}
	if oldVersion < 2 {
		v.RestWeekdays = append([]int(nil), d.RestWeekdays...)
	}
	if oldVersion < 3 {
		v.ActivityArea = d.ActivityArea
		v.BottomMargin = d.BottomMargin
	}
	if oldVersion < 4 {
		v.BubbleCategories = defaultBubbleCategories()
	}
	if oldVersion < 5 {
		v.SleepDurationSeconds = d.SleepDurationSeconds
	}
	if v.SleepDurationSeconds < 5 {
		v.SleepDurationSeconds = 5
	}
	if v.SleepDurationSeconds > 300 {
		v.SleepDurationSeconds = 300
	}
	if v.BubbleCategories == nil {
		v.BubbleCategories = map[string]bool{}
	}
	for category, enabled := range d.BubbleCategories {
		if _, exists := v.BubbleCategories[category]; !exists {
			v.BubbleCategories[category] = enabled
		}
	}
	if v.ActivityArea != "bottom-left" && v.ActivityArea != "bottom-right" {
		v.ActivityArea = "bottom"
	}
	if v.BottomMargin < 0 {
		v.BottomMargin = 0
	}
	if v.BottomMargin > 160 {
		v.BottomMargin = 160
	}
	seen := map[int]bool{}
	restWeekdays := make([]int, 0, len(v.RestWeekdays))
	for _, day := range v.RestWeekdays {
		if day >= 0 && day <= 6 && !seen[day] {
			seen[day] = true
			restWeekdays = append(restWeekdays, day)
		}
	}
	v.RestWeekdays = restWeekdays
	return v
}
