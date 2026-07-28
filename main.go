package main

import (
	"embed"
	"log"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"luluday/internal/autostart"
	"luluday/internal/config"
	"luluday/internal/pet"
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
	petWindowWidth, petWindowHeight := pet.WindowSizeForScale(current.PetScale)
	service := NewAppService(store, func(updated config.Config) {
		if petWindow != nil {
			petWindow.SetAlwaysOnTop(updated.AlwaysOnTop)
			app.Event.Emit("config:changed", updated)
		}
	})
	app = application.New(application.Options{
		Name: "LuluDay", Description: "陪在桌面上的噜噜",
		Services: []application.Service{application.NewService(service)},
		Assets:   application.AssetOptions{Handler: application.AssetFileServerFS(assets)},
		Mac:      application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: false},
		Windows:  application.WindowsOptions{DisableQuitOnLastWindowClosed: true},
	})

	petWindow = app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name: "pet", Title: "噜噜", Width: petWindowWidth, Height: petWindowHeight,
		URL: "/?window=pet", Frameless: true, DisableResize: true,
		AlwaysOnTop:      current.AlwaysOnTop,
		BackgroundType:   application.BackgroundTypeTransparent,
		BackgroundColour: application.NewRGBA(0, 0, 0, 0),
		InitialPosition:  application.WindowXY, X: current.Position.X, Y: current.Position.Y,
		Mac: application.MacWindow{
			Backdrop:      application.MacBackdropTransparent,
			DisableShadow: true,
			CollectionBehavior: application.MacWindowCollectionBehaviorCanJoinAllSpaces |
				application.MacWindowCollectionBehaviorFullScreenAuxiliary |
				application.MacWindowCollectionBehaviorIgnoresCycle,
		},
		Windows: application.WindowsWindow{
			HiddenOnTaskbar:                   true,
			DisableFramelessWindowDecorations: true,
		},
	})
	motionController := pet.NewMotionController(petWindow, func(name string, data any) {
		app.Event.Emit(name, data)
	})
	service.SetMotionController(motionController)
	// Windows are only backed by a native NSWindow once app.Run starts. The
	// eager constraint above configures other platforms, while this hook makes
	// the initial macOS placement effective after the WebView is ready.
	petWindow.RegisterHook(events.Mac.WebViewDidFinishNavigation, func(*application.WindowEvent) {
		motionController.ResizeForScale(store.Get().PetScale)
		motionController.ConstrainNow()
	})
	settingsWindow := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name: "settings", Title: "噜噜 · 设置", Width: 980, Height: 720,
		MinWidth: 780, MinHeight: 600, URL: "/?window=settings",
		BackgroundColour: application.NewRGB(247, 244, 236), Hidden: true,
	})
	settingsWindow.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		settingsWindow.Hide()
		event.Cancel()
	})

	hidePet := func(*application.Context) {
		service.StopMotion()
		petWindow.Hide()
	}
	togglePet := func() {
		if petWindow.IsVisible() {
			hidePet(nil)
			return
		}
		petWindow.Show()
	}
	openSettings := func(*application.Context) {
		settingsWindow.Show().Focus()
	}
	sleepPet := func(*application.Context) {
		service.StopMotion()
		app.Event.Emit("pet:sleep")
	}
	exercisePet := func(*application.Context) {
		service.StopMotion()
		app.Event.Emit("pet:exercise")
	}
	quitApp := func(*application.Context) {
		service.StopMotion()
		app.Quit()
	}

	petMenu := app.ContextMenu.New()
	petMenu.Add("隐藏").OnClick(hidePet)
	petMenu.Add("设置").OnClick(openSettings)
	petMenu.Add("睡觉").OnClick(sleepPet)
	petMenu.Add("锻炼").OnClick(exercisePet)
	petMenu.AddSeparator()
	petMenu.Add("退出").OnClick(quitApp)
	app.ContextMenu.Add("pet-menu", petMenu)

	tray := app.SystemTray.New()
	tray.SetIcon(trayIcon)
	tray.SetTooltip("噜噜 · 你的桌面小伙伴")
	menu := app.NewMenu()
	menu.Add("显示 / 隐藏噜噜").OnClick(func(*application.Context) { togglePet() })
	menu.Add("设置").OnClick(openSettings)
	menu.Add("睡觉").OnClick(sleepPet)
	menu.Add("锻炼").OnClick(exercisePet)
	menu.AddSeparator()
	menu.Add("退出").OnClick(quitApp)
	tray.SetMenu(menu)
	tray.OnClick(togglePet)
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
