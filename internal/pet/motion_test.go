package pet

import (
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestConstrainHorizontalTurnsAtWorkAreaEdges(t *testing.T) {
	workArea := application.Rect{X: -100, Width: 1000}
	tests := []struct {
		name      string
		x         float64
		direction string
		wantX     float64
		wantDir   string
		turned    bool
	}{
		{"left edge", -130, "left", -100, "right", true},
		{"right edge", 750, "right", 700, "left", true},
		{"inside", 200, "right", 200, "right", false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			x, direction, turned := ConstrainHorizontal(test.x, test.direction, workArea, 200)
			if x != test.wantX || direction != test.wantDir || turned != test.turned {
				t.Fatalf("got (%v, %s, %v)", x, direction, turned)
			}
		})
	}
}

func TestJumpOffset(t *testing.T) {
	tests := []struct {
		progress float64
		want     float64
	}{
		{-0.1, 0},
		{0, 0},
		{0.25, 42},
		{0.5, 56},
		{0.75, 42},
		{1, 0},
		{1.1, 0},
	}
	for _, test := range tests {
		if got := JumpOffset(test.progress, 56); got != test.want {
			t.Fatalf("JumpOffset(%v, 56) = %v, want %v", test.progress, got, test.want)
		}
	}
}

func TestJumpMotionOffsetPhases(t *testing.T) {
	if got := JumpMotionOffset(0.1, 56); got != 0 {
		t.Fatalf("anticipation offset = %v, want 0", got)
	}
	apexProgress := (jumpTakeoffProgress + jumpLandingProgress) / 2
	if got := JumpMotionOffset(apexProgress, 56); got != 56 {
		t.Fatalf("apex offset = %v, want 56", got)
	}
	if got := JumpMotionOffset(jumpLandingProgress, 56); got != 0 {
		t.Fatalf("landing offset = %v, want 0", got)
	}
	if got := JumpMotionOffset((jumpLandingProgress+1)/2, 56); got != -4 {
		t.Fatalf("compression offset = %v, want -4", got)
	}
	if got := JumpMotionOffset(1, 56); got != 0 {
		t.Fatalf("settled offset = %v, want 0", got)
	}
}

func TestActivityBounds(t *testing.T) {
	workArea := application.Rect{X: -100, Y: 20, Width: 1000, Height: 900}
	tests := []struct {
		area          string
		minX, maxX, y int
	}{
		{"bottom", -152, 592, 548},
		{"bottom-left", -152, -60, 548},
		{"bottom-right", 500, 592, 548},
	}
	for _, test := range tests {
		minX, maxX, y := ActivityBounds(workArea, 360, 360, test.area, 12, 1)
		if minX != test.minX || maxX != test.maxX || y != test.y {
			t.Fatalf("%s bounds = (%d, %d, %d), want (%d, %d, %d)", test.area, minX, maxX, y, test.minX, test.maxX, test.y)
		}
	}
}

func TestActivityBoundsAccountsForPetScale(t *testing.T) {
	workArea := application.Rect{Width: 1920, Height: 1080}
	tinyMinX, _, _ := ActivityBounds(workArea, 360, 360, "bottom", 12, 0.3)
	smallMinX, _, _ := ActivityBounds(workArea, 360, 360, "bottom", 12, 0.7)
	largeMinX, _, _ := ActivityBounds(workArea, 360, 360, "bottom", 12, 1.3)
	if tinyMinX != -135 || smallMinX != -87 || largeMinX != -17 {
		t.Fatalf("scaled edge bleed = (%d, %d, %d), want (-135, -87, -17)", tinyMinX, smallMinX, largeMinX)
	}
}

func TestWindowSizeForScale(t *testing.T) {
	tests := []struct {
		scale         float64
		width, height int
	}{
		{0.3, 96, 98},
		{0.5, 142, 147},
		{1, 260, 269},
		{1.3, 331, 343},
		{0, 260, 269},
	}
	for _, test := range tests {
		width, height := WindowSizeForScale(test.scale)
		if width != test.width || height != test.height {
			t.Fatalf("WindowSizeForScale(%v) = (%d, %d), want (%d, %d)", test.scale, width, height, test.width, test.height)
		}
	}
}

func TestLogicalWorkAreaNormalisesRetinaScreenFromWails(t *testing.T) {
	screen := &application.Screen{
		ScaleFactor: 2,
		WorkArea: application.Rect{
			X: 0, Y: 48, Width: 2880, Height: 1752,
		},
		PhysicalWorkArea: application.Rect{
			X: 0, Y: 48, Width: 2880, Height: 1752,
		},
	}

	got := logicalWorkArea(screen)
	want := application.Rect{X: 0, Y: 24, Width: 1440, Height: 876}
	if got != want {
		t.Fatalf("logicalWorkArea() = %+v, want %+v", got, want)
	}
}

func TestWindowSizeForBubbleContent(t *testing.T) {
	tests := []struct {
		mode          string
		width, height int
	}{
		{"none", 260, 269},
		{"normal", 316, 369},
		{"action", 346, 479},
	}
	for _, test := range tests {
		width, height := WindowSizeForContent(1, test.mode)
		if width != test.width || height != test.height {
			t.Fatalf("WindowSizeForContent(1, %q) = (%d, %d), want (%d, %d)", test.mode, width, height, test.width, test.height)
		}
	}
}
