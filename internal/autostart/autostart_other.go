//go:build !windows

package autostart

import "errors"

var ErrDevelopmentBuild = errors.New("当前平台暂未支持开机启动")

func Available() bool        { return false }
func Set(enabled bool) error { return ErrDevelopmentBuild }
