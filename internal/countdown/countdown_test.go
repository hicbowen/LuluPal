package countdown

import (
	"testing"
	"time"
)

func TestCalendarBoundaries(t *testing.T) {
	loc := time.FixedZone("test", 8*60*60)
	cases := []struct {
		name               string
		now                time.Time
		target             string
		days               int
		targetDay, expired bool
		after              int
	}{
		{"cross-year", time.Date(2025, 12, 31, 23, 59, 0, 0, loc), "2026-01-02", 2, false, false, 0},
		{"leap-year", time.Date(2024, 2, 28, 12, 0, 0, 0, loc), "2024-03-01", 2, false, false, 0},
		{"target-day", time.Date(2026, 7, 25, 23, 0, 0, 0, loc), "2026-07-25", 0, true, false, 0},
		{"expired", time.Date(2026, 7, 25, 1, 0, 0, 0, loc), "2026-07-20", 0, false, true, 5},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Calculate(tc.now, tc.target, Options{IncludeTargetDate: true})
			if err != nil {
				t.Fatal(err)
			}
			if got.CalendarDays != tc.days || got.IsTargetDay != tc.targetDay || got.IsExpired != tc.expired || got.DaysAfterTarget != tc.after {
				t.Fatalf("unexpected result: %+v", got)
			}
		})
	}
}

func TestWorkingDayOverrides(t *testing.T) {
	got, err := Calculate(time.Date(2026, 7, 24, 9, 0, 0, 0, time.Local), "2026-07-27", Options{
		IncludeToday: true, IncludeTargetDate: true,
		RestDates: map[string]bool{"2026-07-24": true}, ExtraWorkDates: map[string]bool{"2026-07-25": true},
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.WorkingDays != 2 {
		t.Fatalf("got %d, want 2", got.WorkingDays)
	}
}

func TestCustomMondayTuesdayRestSchedule(t *testing.T) {
	got, err := Calculate(time.Date(2026, 7, 27, 9, 0, 0, 0, time.Local), "2026-08-02", Options{
		IncludeToday: true, IncludeTargetDate: true, CustomWorkdays: true,
		Workdays: []time.Weekday{time.Wednesday, time.Thursday, time.Friday, time.Saturday, time.Sunday},
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.WorkingDays != 5 {
		t.Fatalf("got %d, want 5", got.WorkingDays)
	}
}

func TestAllWeekdaysCanBeRestDays(t *testing.T) {
	got, err := Calculate(time.Date(2026, 7, 27, 9, 0, 0, 0, time.Local), "2026-08-02", Options{
		IncludeToday: true, IncludeTargetDate: true, CustomWorkdays: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.WorkingDays != 0 {
		t.Fatalf("got %d, want 0", got.WorkingDays)
	}
}
