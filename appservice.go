package main

import (
	"fmt"
	"luluday/internal/autostart"
	"luluday/internal/config"
	"luluday/internal/countdown"
	"luluday/internal/pet"
	"time"
)

type AppService struct {
	store    *config.Store
	onChange func(config.Config)
	motion   *pet.MotionController
}

func NewAppService(s *config.Store, changed func(config.Config)) *AppService {
	return &AppService{store: s, onChange: changed}
}
func (s *AppService) SetMotionController(controller *pet.MotionController) {
	s.motion = controller
	current := s.store.Get()
	controller.ConfigureActivityArea(current.ActivityArea, current.BottomMargin, current.PetScale)
	controller.ResizeForScale(current.PetScale)
	controller.ConstrainNow()
}
func (s *AppService) StartMotion(direction string, speed float64, durationMS int) {
	if s.motion != nil {
		s.motion.Start(pet.MotionRequest{Direction: direction, Speed: speed, Duration: time.Duration(durationMS) * time.Millisecond})
	}
}
func (s *AppService) StartJump(height float64, durationMS int) {
	if s.motion != nil {
		s.motion.Jump(height, time.Duration(durationMS)*time.Millisecond)
	}
}
func (s *AppService) StopMotion() {
	if s.motion != nil {
		s.motion.Stop()
	}
}
func (s *AppService) SetPetBubbleMode(mode string) {
	if s.motion != nil {
		s.motion.Stop()
		s.motion.SetBubbleMode(mode)
	}
}
func (s *AppService) GetConfig() config.Config { return s.store.Get() }
func (s *AppService) SaveConfig(v config.Config) error {
	current := s.store.Get()
	if v.LaunchAtStartup != current.LaunchAtStartup {
		if err := autostart.Set(v.LaunchAtStartup); err != nil {
			return fmt.Errorf("设置开机启动失败: %w", err)
		}
	}
	if err := s.store.Save(v); err != nil {
		return err
	}
	if s.motion != nil {
		s.motion.Stop()
		s.motion.ConfigureActivityArea(v.ActivityArea, v.BottomMargin, v.PetScale)
		s.motion.ResizeForScale(v.PetScale)
		s.motion.ConstrainNow()
	}
	if s.onChange != nil {
		s.onChange(s.store.Get())
	}
	return nil
}
func (s *AppService) AutostartAvailable() bool { return autostart.Available() }
func (s *AppService) SetCurrentPositionAsHome() error {
	if s.motion == nil {
		return fmt.Errorf("桌宠窗口尚未就绪")
	}
	s.motion.ConstrainNow()
	x, y := s.motion.Position()
	current := s.store.Get()
	current.Position.X, current.Position.Y = x, y
	if err := s.store.Save(current); err != nil {
		return err
	}
	if s.onChange != nil {
		s.onChange(s.store.Get())
	}
	return nil
}
func (s *AppService) RestoreHomePosition() {
	if s.motion == nil {
		return
	}
	current := s.store.Get()
	s.motion.SetPosition(current.Position.X, current.Position.Y)
	s.motion.ConstrainNow()
}
func (s *AppService) KeepInActivityArea() {
	if s.motion != nil {
		s.motion.ConstrainNow()
	}
}
func (s *AppService) Countdown(target string, includeToday, includeTarget bool, restWeekdays []int) (countdown.Result, error) {
	if target == "" {
		return countdown.Result{}, fmt.Errorf("target date is required")
	}
	rest := map[int]bool{}
	for _, day := range restWeekdays {
		if day >= 0 && day <= 6 {
			rest[day] = true
		}
	}
	workdays := make([]time.Weekday, 0, 7-len(rest))
	for day := time.Sunday; day <= time.Saturday; day++ {
		if !rest[int(day)] {
			workdays = append(workdays, day)
		}
	}
	return countdown.Calculate(time.Now(), target, countdown.Options{
		IncludeToday: includeToday, IncludeTargetDate: includeTarget,
		Workdays: workdays, CustomWorkdays: true,
	})
}
