package main

import (
	"embed"
	"log"
	"os"
	"path/filepath"

	"luluday/internal/autostart"
	"luluday/internal/config"
	"luluday/internal/pet"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var trayIcon []byte

func main() {
	configRoot, err := os.UserConfigDir()
	if err != nil {
		log.Fatal(err)
	}
	store := config.NewStore(filepath.Join(configRoot, "LuluDay", "config.json"))
	current, err := store.Load()
	if err != nil {
		log.Printf("config load failed: %v", err)
	}
	if current.LaunchAtStartup {
		if err := autostart.Set(true); err != nil {
			log.Printf("autostart sync failed: %v", err)
		}
	}

	var app *application.App
	var petWindow *application.WebviewWindow
	service := NewAppService(store, func(updated config.Config) {
		if petWindow != nil {
			petWindow.SetAlwaysOnTop(updated.AlwaysOnTop)
			app.Event.Emit("config:changed", updated)
		}
	})
	app = application.New(application.Options{
		Name: "LuluDay", Description: "离职倒计时桌面宠物",
		Services: []application.Service{application.NewService(service)},
		Assets:   application.AssetOptions{Handler: application.AssetFileServerFS(assets)},
		Mac:      application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: false},
		Windows:  application.WindowsOptions{DisableQuitOnLastWindowClosed: true},
	})

	petWindow = app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name: "pet", Title: "噜噜", Width: 360, Height: 360,
		URL: "/?window=pet", Frameless: true, DisableResize: true,
		AlwaysOnTop:      current.AlwaysOnTop,
		BackgroundType:   application.BackgroundTypeTransparent,
		BackgroundColour: application.NewRGBA(0, 0, 0, 0),
		InitialPosition:  application.WindowXY, X: current.Position.X, Y: current.Position.Y,
		Windows: application.WindowsWindow{
			HiddenOnTaskbar:                   true,
			DisableFramelessWindowDecorations: true,
		},
	})
	service.SetMotionController(pet.NewMotionController(petWindow, func(name string, data any) {
		app.Event.Emit(name, data)
	}))
	settingsWindow := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name: "settings", Title: "噜噜日 · 设置", Width: 920, Height: 680,
		MinWidth: 760, MinHeight: 560, URL: "/?window=settings",
		BackgroundColour: application.NewRGB(247, 244, 236), Hidden: true,
	})
	settingsWindow.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		settingsWindow.Hide()
		event.Cancel()
	})

	tray := app.SystemTray.New()
	tray.SetIcon(trayIcon)
	tray.SetTooltip("噜噜日 · 离职倒计时桌宠")
	menu := app.NewMenu()
	menu.Add("显示 / 隐藏噜噜").OnClick(func(*application.Context) {
		if petWindow.IsVisible() {
			service.StopMotion()
			petWindow.Hide()
		} else {
			petWindow.Show()
		}
	})
	menu.Add("打开设置").OnClick(func(*application.Context) {
		settingsWindow.Show().Focus()
	})
	menu.AddSeparator()
	menu.Add("退出噜噜日").OnClick(func(*application.Context) {
		service.StopMotion()
		app.Quit()
	})
	tray.SetMenu(menu)
	tray.OnClick(func() {
		if petWindow.IsVisible() {
			service.StopMotion()
			petWindow.Hide()
		} else {
			petWindow.Show()
		}
	})
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
