package pet

import (
	"math"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type MotionRequest struct {
	Direction string
	Speed     float64
	Duration  time.Duration
}

type MotionController struct {
	window     *application.WebviewWindow
	emit       func(string, any)
	mu         sync.Mutex
	cancel     chan struct{}
	done       chan struct{}
	area       string
	margin     int
	scale      float64
	bubbleMode string
}

func NewMotionController(window *application.WebviewWindow, emit func(string, any)) *MotionController {
	return &MotionController{window: window, emit: emit, area: "bottom", margin: 12, scale: 1}
}

func (c *MotionController) ConfigureActivityArea(area string, margin int, scale float64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.area, c.margin = normaliseActivityArea(area, margin)
	if scale < 0.3 || scale > 1.3 {
		scale = 1
	}
	c.scale = scale
}

func (c *MotionController) Position() (int, int) { return c.window.Position() }

func (c *MotionController) SetPosition(x, y int) { c.window.SetPosition(x, y) }

func (c *MotionController) ConstrainNow() {
	screen, err := c.window.GetScreen()
	if err != nil || screen == nil {
		return
	}
	x, _ := c.window.Position()
	bounds := c.window.Bounds()
	c.mu.Lock()
	area, margin, scale := c.area, c.margin, c.scale
	c.mu.Unlock()
	minX, maxX, y := ActivityBounds(screen.WorkArea, bounds.Width, bounds.Height, area, margin, scale)
	if x < minX {
		x = minX
	}
	if x > maxX {
		x = maxX
	}
	c.window.SetPosition(x, y)
}

func (c *MotionController) Start(request MotionRequest) {
	c.Stop()
	if request.Speed <= 0 || request.Duration <= 0 {
		return
	}
	cancel, done := make(chan struct{}), make(chan struct{})
	c.mu.Lock()
	c.cancel, c.done = cancel, done
	c.mu.Unlock()
	go c.run(request, cancel, done)
}

func (c *MotionController) Jump(height float64, duration time.Duration) {
	c.Stop()
	if height <= 0 || duration <= 0 {
		return
	}
	cancel, done := make(chan struct{}), make(chan struct{})
	c.mu.Lock()
	c.cancel, c.done = cancel, done
	c.mu.Unlock()
	go c.runJump(height, duration, cancel, done)
}

func (c *MotionController) Stop() {
	c.mu.Lock()
	cancel, done := c.cancel, c.done
	c.cancel, c.done = nil, nil
	c.mu.Unlock()
	if cancel == nil {
		return
	}
	close(cancel)
	select {
	case <-done:
	case <-time.After(150 * time.Millisecond):
	}
}

func (c *MotionController) run(request MotionRequest, cancel <-chan struct{}, done chan<- struct{}) {
	defer close(done)
	direction := request.Direction
	if direction != "left" {
		direction = "right"
	}
	c.emit("motion:started", direction)
	defer c.emit("motion:stopped", direction)

	ticker := time.NewTicker(time.Second / 30)
	defer ticker.Stop()
	deadline, lastTick := time.Now().Add(request.Duration), time.Now()
	x, _ := c.window.Position()
	positionX := float64(x)

	for {
		select {
		case <-cancel:
			return
		case now := <-ticker.C:
			if now.After(deadline) {
				return
			}
			elapsed := now.Sub(lastTick).Seconds()
			lastTick = now
			if direction == "left" {
				positionX -= request.Speed * elapsed
			} else {
				positionX += request.Speed * elapsed
			}
			screen, err := c.window.GetScreen()
			if err != nil || screen == nil {
				continue
			}
			bounds := c.window.Bounds()
			c.mu.Lock()
			area, margin, scale := c.area, c.margin, c.scale
			c.mu.Unlock()
			minX, maxX, constrainedY := ActivityBounds(screen.WorkArea, bounds.Width, bounds.Height, area, margin, scale)
			nextX, nextDirection, turned := ConstrainHorizontalRange(positionX, direction, minX, maxX)
			positionX, direction = nextX, nextDirection
			if turned {
				c.emit("motion:direction", direction)
			}
			c.window.SetPosition(int(positionX), constrainedY)
		}
	}
}

func (c *MotionController) runJump(height float64, duration time.Duration, cancel <-chan struct{}, done chan<- struct{}) {
	defer close(done)
	ticker := time.NewTicker(time.Second / 60)
	defer ticker.Stop()
	start := time.Now()
	baseX, baseY := c.window.Position()
	defer c.window.SetPosition(baseX, baseY)

	for {
		select {
		case <-cancel:
			return
		case now := <-ticker.C:
			progress := now.Sub(start).Seconds() / duration.Seconds()
			if progress >= 1 {
				return
			}
			offset := JumpMotionOffset(progress, height)
			currentX, _ := c.window.Position()
			c.window.SetPosition(currentX, baseY-int(math.Round(offset)))
		}
	}
}

const (
	jumpTakeoffProgress = 0.16
	jumpLandingProgress = 0.82
	petContentWidth     = 236
	petContentHeight    = 245
	petWindowMinWidth   = 96
	petWindowMinHeight  = 98
	petWindowPaddingX   = 24
	petWindowPaddingY   = 24
	normalBubbleWidth   = 316
	normalBubbleHeight  = 100
	actionBubbleWidth   = 346
	actionBubbleHeight  = 210
)

func WindowSizeForScale(scale float64) (width, height int) {
	return WindowSizeForContent(scale, "none")
}

func WindowSizeForContent(scale float64, mode string) (width, height int) {
	if scale < 0.3 || scale > 1.3 {
		scale = 1
	}
	width = int(math.Round(petContentWidth*scale)) + petWindowPaddingX
	height = int(math.Round(petContentHeight*scale)) + petWindowPaddingY
	if width < petWindowMinWidth {
		width = petWindowMinWidth
	}
	if height < petWindowMinHeight {
		height = petWindowMinHeight
	}
	switch mode {
	case "action":
		if width < actionBubbleWidth {
			width = actionBubbleWidth
		}
		height += actionBubbleHeight
	case "normal":
		if width < normalBubbleWidth {
			width = normalBubbleWidth
		}
		height += normalBubbleHeight
	}
	return
}

// ResizeForScale keeps the pet's bottom-centre anchored while changing the
// native window size, so the character does not jump when its scale changes.
func (c *MotionController) ResizeForScale(scale float64) {
	c.mu.Lock()
	mode := c.bubbleMode
	c.mu.Unlock()
	newWidth, newHeight := WindowSizeForContent(scale, mode)
	bounds := c.window.Bounds()
	if bounds.Width == newWidth && bounds.Height == newHeight {
		return
	}
	x, y := c.window.Position()
	newX := x + (bounds.Width-newWidth)/2
	newY := y + bounds.Height - newHeight
	c.window.SetSize(newWidth, newHeight)
	c.window.SetPosition(newX, newY)
}

func (c *MotionController) SetBubbleMode(mode string) {
	if mode != "normal" && mode != "action" {
		mode = "none"
	}
	c.mu.Lock()
	if c.bubbleMode == mode {
		c.mu.Unlock()
		return
	}
	c.bubbleMode = mode
	scale := c.scale
	c.mu.Unlock()
	c.ResizeForScale(scale)
	c.ConstrainNow()
}

func JumpMotionOffset(progress, height float64) float64 {
	if progress <= jumpTakeoffProgress || progress >= 1 || height <= 0 {
		return 0
	}
	if progress < jumpLandingProgress {
		flightProgress := (progress - jumpTakeoffProgress) / (jumpLandingProgress - jumpTakeoffProgress)
		return JumpOffset(flightProgress, height)
	}
	landingProgress := (progress - jumpLandingProgress) / (1 - jumpLandingProgress)
	compression := math.Min(4, height*0.08)
	return -compression * math.Sin(math.Pi*landingProgress)
}

func JumpOffset(progress, height float64) float64 {
	if progress <= 0 || progress >= 1 || height <= 0 {
		return 0
	}
	return 4 * height * progress * (1 - progress)
}

func ConstrainHorizontal(x float64, direction string, workArea application.Rect, windowWidth int) (float64, string, bool) {
	return ConstrainHorizontalRange(x, direction, workArea.X, workArea.X+workArea.Width-windowWidth)
}

func ConstrainHorizontalRange(x float64, direction string, minX, maxX int) (float64, string, bool) {
	if int(x) <= minX {
		return float64(minX), "right", direction != "right"
	}
	if int(x) >= maxX {
		return float64(maxX), "left", direction != "left"
	}
	return x, direction, false
}

func ActivityBounds(workArea application.Rect, windowWidth, windowHeight int, area string, margin int, petScale float64) (minX, maxX, y int) {
	area, margin = normaliseActivityArea(area, margin)
	// Let transparent horizontal padding cross the screen edge while keeping
	// roughly 10px of the visible character inside the work area. This remains
	// correct as the window expands and contracts around bubbles.
	transparentEdgeBleed := int(math.Round(
		(float64(windowWidth)-petContentWidth*petScale)/2 - 10,
	))
	if transparentEdgeBleed < 0 {
		transparentEdgeBleed = 0
	}
	if transparentEdgeBleed > 150 {
		transparentEdgeBleed = 150
	}
	minX = workArea.X - transparentEdgeBleed
	maxX = workArea.X + workArea.Width - windowWidth + transparentEdgeBleed
	segment := workArea.Width * 2 / 5
	if area == "bottom-left" {
		maxX = workArea.X + segment - windowWidth
	}
	if area == "bottom-right" {
		minX = workArea.X + workArea.Width - segment
	}
	if maxX < minX {
		maxX = minX
	}
	y = workArea.Y + workArea.Height - windowHeight - margin
	return
}

func normaliseActivityArea(area string, margin int) (string, int) {
	if area != "bottom-left" && area != "bottom-right" {
		area = "bottom"
	}
	if margin < 0 {
		margin = 0
	}
	if margin > 160 {
		margin = 160
	}
	return area, margin
}
