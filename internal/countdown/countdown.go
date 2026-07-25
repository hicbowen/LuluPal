package countdown

import (
	"fmt"
	"time"
)

type Options struct {
	IncludeToday, IncludeTargetDate bool
	Workdays                        []time.Weekday
	CustomWorkdays                  bool
	RestDates, ExtraWorkDates       map[string]bool
}

type Result struct {
	TargetDate      string `json:"targetDate"`
	CalendarDays    int    `json:"calendarDays"`
	WorkingDays     int    `json:"workingDays"`
	IsTargetDay     bool   `json:"isTargetDay"`
	IsExpired       bool   `json:"isExpired"`
	DaysAfterTarget int    `json:"daysAfterTarget"`
}

func Calculate(now time.Time, targetDate string, o Options) (Result, error) {
	target, err := time.ParseInLocation("2006-01-02", targetDate, now.Location())
	if err != nil {
		return Result{}, fmt.Errorf("invalid target date: %w", err)
	}
	today := dateOnly(now)
	r := Result{TargetDate: targetDate}
	delta := daysBetween(today, target)
	r.IsTargetDay, r.IsExpired = delta == 0, delta < 0
	if delta < 0 {
		r.DaysAfterTarget = -delta
		return r, nil
	}
	if delta == 0 {
		return r, nil
	}
	r.CalendarDays = delta
	if o.IncludeToday {
		r.CalendarDays++
	}
	if !o.IncludeTargetDate {
		r.CalendarDays--
	}
	if r.CalendarDays < 0 {
		r.CalendarDays = 0
	}
	r.WorkingDays = countWorkingDays(today, target, o)
	return r, nil
}

func dateOnly(v time.Time) time.Time {
	y, m, d := v.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, v.Location())
}

func daysBetween(from, to time.Time) int {
	n := 0
	for c := from; c.Before(to); c = c.AddDate(0, 0, 1) {
		n++
	}
	for c := from; c.After(to); c = c.AddDate(0, 0, -1) {
		n--
	}
	return n
}

func countWorkingDays(today, target time.Time, o Options) int {
	days := o.Workdays
	if !o.CustomWorkdays {
		days = []time.Weekday{time.Monday, time.Tuesday, time.Wednesday, time.Thursday, time.Friday}
	}
	allowed := map[time.Weekday]bool{}
	for _, d := range days {
		allowed[d] = true
	}
	n := 0
	for c := today; !c.After(target); c = c.AddDate(0, 0, 1) {
		if c.Equal(today) && !o.IncludeToday {
			continue
		}
		if c.Equal(target) && !o.IncludeTargetDate {
			continue
		}
		key := c.Format("2006-01-02")
		if o.ExtraWorkDates[key] || (allowed[c.Weekday()] && !o.RestDates[key]) {
			n++
		}
	}
	return n
}
