```text
请为我实现一个完整的“离职倒计时桌面宠物”应用。

## 一、项目目标

开发一个常驻桌面的水豚桌宠程序。桌宠会在屏幕上待机、走动、跳跃、睡觉，并随机弹出气泡，提醒用户距离设定的离职日期还有多少天。

用户还可以点击、抚摸、拖拽桌宠，触发不同动画和文案。

技术栈优先使用：

- Wails 3
- Go
- React
- TypeScript
- Vite
- react-desktop-shell 用于设置窗口
- dayjs 用于前端日期显示，不使用 moment

如果当前仓库已经存在，请先检查现有代码、依赖和 Wails 版本，在现有结构上实施，不要盲目重建。

首要支持平台：

1. Windows 11
2. macOS
3. Linux 只保留兼容结构，不要求第一阶段完整实现

角色标准参考图：

`character-reference.jpg`

这张图片是角色四视图设定，只用于确认角色外观，不能直接切割成走路动画。

角色形象固定为：

- 淡黄色、胖乎乎的水豚角色
- 大面积橙色口鼻区域
- 头顶小橘子
- 橙色短裤
- 短小四肢
- 柔和圆润的3D玩具风格

不要尝试用代码自动生成角色动画。

---

## 二、产品范围

应用包含两个窗口：

### 1. 桌宠窗口

特点：

- 透明背景
- 无边框
- 不显示任务栏按钮
- 始终置顶
- 默认不抢占焦点
- 可以拖动
- 可以跨显示器移动
- 支持高DPI缩放
- 透明区域尽可能不阻挡桌面点击
- 宠物实际可见区域可以接收点击和抚摸事件
- 窗口大小根据宠物素材和气泡动态调整

### 2. 设置窗口

使用普通桌面窗口，使用 react-desktop-shell 构建。

设置窗口负责：

- 离职日期
- 倒计时方式
- 桌宠大小
- 桌宠行为
- 气泡频率
- 文案管理
- 勿扰时间
- 开机启动
- 始终置顶
- 动画和声音开关
- 数据重置

桌宠窗口与设置窗口必须彼此独立，不能把完整设置页面塞入透明宠物窗口。

---

## 三、代码架构

建议结构如下，可根据现有仓库调整：

```text
resign-pet/
├── frontend/
│   ├── src/
│   │   ├── windows/
│   │   │   ├── pet/
│   │   │   │   ├── PetWindow.tsx
│   │   │   │   ├── PetRenderer.tsx
│   │   │   │   ├── SpeechBubble.tsx
│   │   │   │   └── PetWindow.css
│   │   │   └── settings/
│   │   │       ├── SettingsWindow.tsx
│   │   │       └── pages/
│   │   ├── animation/
│   │   │   ├── AnimationPlayer.tsx
│   │   │   ├── animationManifest.ts
│   │   │   └── preloadAssets.ts
│   │   ├── interaction/
│   │   │   ├── pettingDetector.ts
│   │   │   ├── clickDetector.ts
│   │   │   └── dragController.ts
│   │   ├── messages/
│   │   │   ├── messageTypes.ts
│   │   │   └── defaultMessages.zh-CN.ts
│   │   ├── stores/
│   │   └── types/
│   └── public/
│       └── pets/
│           └── lulu/
│               ├── manifest.json
│               ├── reference/
│               └── animations/
├── internal/
│   ├── app/
│   ├── pet/
│   │   ├── controller.go
│   │   ├── behavior.go
│   │   ├── scheduler.go
│   │   └── events.go
│   ├── countdown/
│   │   ├── countdown.go
│   │   └── workday.go
│   ├── messages/
│   ├── config/
│   ├── position/
│   ├── screen/
│   ├── autostart/
│   ├── tray/
│   └── platform/
│       ├── windows/
│       ├── darwin/
│       └── linux/
├── tools/
│   ├── sprite-slicer/
│   └── validate-assets/
└── tests/
```

保持模块清晰，不要把窗口控制、倒计时、动画调度和React组件全部混在一起。

---

## 四、桌宠动画素材系统

不要把动画名称和帧数写死在React组件里。

为每个宠物提供一个资源清单：

```json
{
  "id": "lulu",
  "name": "噜噜",
  "defaultScale": 1,
  "anchor": {
    "x": 0.5,
    "y": 1
  },
  "animations": {
    "idle": {
      "frames": [
        "animations/idle/001.png",
        "animations/idle/002.png",
        "animations/idle/003.png",
        "animations/idle/004.png"
      ],
      "durations": [500, 180, 180, 500],
      "loop": true
    },
    "walk": {
      "frames": [
        "animations/walk/001.png",
        "animations/walk/002.png",
        "animations/walk/003.png",
        "animations/walk/004.png",
        "animations/walk/005.png",
        "animations/walk/006.png"
      ],
      "fps": 10,
      "loop": true
    }
  }
}
```

至少支持以下动画名称：

```text
idle
blink
walk
jump
sleep
wake
petting
clicked
dragged
speaking
celebrate
sad
```

要求：

- 支持不同动画拥有不同帧数
- 支持逐帧独立时长
- 支持循环和单次播放
- 支持动画结束事件
- 支持预加载，避免切换动画时闪烁
- 支持水平翻转，左走直接翻转右走素材
- 支持动作锚点，切换动画时脚底位置不跳动
- 素材缺失时自动回退到 idle
- 开发模式下输出明确的资源错误

第一阶段可以使用简单占位图和CSS轻微缩放、上下浮动模拟待机，但代码结构必须允许后续直接替换为真正PNG序列帧。

不要把角色参考四视图自动切成动画帧。

---

## 五、素材切割工具

实现一个开发工具，用于把AI生成的宫格图片切成独立PNG帧。

需要支持：

```bash
npm run sprite:slice -- \
  --input assets/walk-sheet.png \
  --columns 3 \
  --rows 2 \
  --output frontend/public/pets/lulu/animations/walk
```

要求：

- 按从左到右、从上到下切割
- 输出 `001.png`、`002.png`
- 支持自动裁剪外围透明区域
- 所有帧最终画布大小必须一致
- 可以统一补透明边距
- 可以指定脚底基准线
- 输出后自动生成或更新 manifest
- 提供素材校验命令

校验内容：

- 图片是否存在
- 帧尺寸是否一致
- 是否带透明通道
- manifest引用是否有效
- 动画是否至少有一帧

---

## 六、行为状态机

不要通过散落的 `setTimeout` 控制宠物行为。

实现明确的状态机：

```text
Idle
Walk
Jump
Sleep
Wake
Speaking
Petting
Clicked
Dragging
Celebrating
Paused
Hidden
```

状态优先级：

```text
Celebrating
Dragging
Petting / Clicked
Speaking
Jump
Walk
Sleep
Idle
```

高优先级动作可以中断低优先级动作。

例如：

- 拖拽可以中断走路和睡觉
- 抚摸可以中断待机
- 普通随机气泡不能打断拖拽
- 庆祝动画不能被普通随机动作打断
- 气泡出现时，宠物可以停止移动
- 睡眠状态被点击后先播放 wake

行为调度使用带权重的随机系统：

```text
待机：45%
走路：25%
跳跃：10%
说话：10%
睡觉：7%
特殊动作：3%
```

权重必须可配置。

随机行为还需要：

- 最小触发间隔
- 最大触发间隔
- 单动作冷却时间
- 最近动作去重
- 避免连续多次走路或弹气泡
- 勿扰时段暂停气泡
- 用户正在拖动时暂停随机行为
- 应用刚启动后不要立即频繁弹气泡

随机数调度逻辑应支持注入固定随机种子，方便测试。

---

## 七、移动系统

由Go端负责桌宠窗口的实际屏幕坐标和移动，不要让React每帧通过IPC发送窗口位置。

实现：

```go
type MotionRequest struct {
    Direction string
    Speed     float64
    Duration  time.Duration
}
```

Go端负责：

- 使用定时器平滑更新窗口位置
- 根据刷新时间计算位移，而不是每帧固定像素
- 到达屏幕边缘时停止或转向
- 不允许宠物移动到工作区域之外
- 避开任务栏或Dock
- 支持多显示器
- 支持不同显示器缩放比例
- 记录宠物当前所在显示器
- 拖动结束后自动吸附回可见区域
- 程序重启后恢复上次位置

前端只负责：

- 播放对应方向的走路动画
- 接收开始移动、停止移动、转向等事件
- 显示当前状态

不要在React中创建高频的Go调用。

---

## 八、透明窗口与鼠标命中

这是本项目的技术重点。

实现平台抽象：

```go
type PetWindowPlatform interface {
    SetAlwaysOnTop(enabled bool) error
    SetClickThrough(enabled bool) error
    Move(x, y int) error
    GetPosition() (int, int, error)
    GetWorkArea() Rect
    HideFromTaskbar() error
    SetFocusable(enabled bool) error
}
```

Windows和macOS分别实现。

目标行为：

- 宠物身体区域可以点击
- 周围透明区域尽量穿透到桌面
- 气泡区域可以点击关闭
- 拖动时必须正常接收鼠标移动
- 平时不能频繁抢走用户当前窗口焦点

如果Wails现有API不能完成，需要编写最小范围的原生平台代码。

不要为了实现点击穿透，把整个桌宠窗口永久设为鼠标穿透，否则无法交互。

优先方案：

1. 根据预定义命中区域判断
2. 根据当前动画帧提供简化的多边形或矩形命中区
3. 平台允许时，再实现基于透明像素的精确命中

第一版可以使用角色身体矩形和头部矩形，不必一开始实现逐像素命中。

---

## 九、倒计时系统

支持两种模式：

### 自然日

以用户本地时区的日期为准，不受当前时分秒影响。

默认逻辑：

- 目标日期之前显示“还有 N 天”
- 目标日期当天显示“今天解放”
- 目标日期之后显示“已经自由 N 天”

必须明确处理：

- 是否包含今天
- 是否包含目标日期
- 跨年
- 闰年
- 夏令时
- 用户修改系统时间

### 工作日

不要联网依赖节假日接口。

允许用户设置：

- 每周工作日，例如周一至周五
- 自定义休息日期
- 自定义补班日期
- 是否包含今天
- 是否包含目标日期

设置页面实时显示计算说明和结果预览，避免用户不知道系统怎么算出来的。

核心结果结构：

```go
type CountdownResult struct {
    TargetDate          string
    CalendarDays        int
    WorkingDays         int
    IsTargetDay         bool
    IsExpired           bool
    DaysAfterTarget     int
}
```

为所有边界场景编写单元测试。

---

## 十、气泡和文案系统

气泡使用React/CSS绘制，不要做进角色图片里。

气泡支持：

- 自动调整左右方向
- 靠近屏幕右边时显示在角色左侧
- 靠近屏幕顶部时显示在角色下方
- 长文本自动换行
- 自动消失
- 点击关闭
- 宠物移动时跟随窗口
- 气泡出现和消失动画
- 不超出当前显示器工作区域

文案采用数据驱动：

```ts
interface PetMessage {
  id: string
  text: string
  category:
    | "countdown"
    | "work"
    | "morning"
    | "lunch"
    | "evening"
    | "petting"
    | "click"
    | "sleep"
    | "special"

  weight: number
  minDays?: number
  maxDays?: number
  weekdays?: number[]
  timeRange?: {
    start: string
    end: string
  }
  cooldownMinutes?: number
}
```

支持占位符：

```text
{days}
{workingDays}
{targetDate}
{weekday}
{time}
```

示例：

```text
距离解放还有 {days} 天。
今天也成功熬过去一点。
还有 {workingDays} 个工作日，坚持住。
摸我也不能提前离职。
再摸一下少一天。骗你的。
你是在摸鱼，还是在摸我？
```

消息选择逻辑：

- 过滤不符合日期和时间条件的消息
- 排除仍在冷却期的消息
- 根据权重随机选择
- 避免连续重复
- 记录最近显示历史
- 用户可以关闭某个分类
- 用户可以添加自己的文案
- 用户自定义文案保存在配置文件中

不要接入AI服务，第一版完全离线运行。

---

## 十一、交互系统

### 单击

- 播放 clicked 动画
- 随机显示点击类文案
- 连续点击时使用不同反应
- 设置最短触发间隔，防止动画疯狂重启

### 双击

默认立即显示最新倒计时。

### 抚摸

在角色头部定义独立命中区域。

抚摸判定参考：

- 指针位于头部区域
- 800毫秒内累计移动距离超过阈值
- 水平方向至少改变3次
- 排除拖动窗口
- 触发后进入冷却

触发结果：

- 播放 petting 动画
- 显示抚摸类文案
- 增加一次互动统计

抚摸检测逻辑写成独立纯函数并提供测试，不要完全写死在组件事件回调中。

### 拖拽

- 鼠标按下并移动超过阈值后进入拖拽
- 播放 dragged 动画
- Go端窗口跟随鼠标
- 松开后保持当前位置
- 超出屏幕时自动修正
- 拖动过程不能触发点击或抚摸
- 支持触控板操作

### 右键

显示轻量菜单：

```text
立即显示倒计时
暂停活动
隐藏桌宠
打开设置
退出
```

如果透明窗口中的右键菜单不稳定，可以通过系统托盘提供相同功能。

---

## 十二、离职日期阶段行为

根据剩余时间改变行为和文案。

建议阶段：

```text
90天以上：普通状态
31～90天：偶尔期待
8～30天：明显活跃
2～7天：高频兴奋
1天：特殊状态
当天：庆祝状态
日期之后：自由纪念状态
```

行为变化示例：

- 越接近目标日期，庆祝和跳跃权重越高
- 最后一周增加专属文案
- 当天启动时自动播放 celebrate
- 当天的庆祝动画每天最多自动播放一次
- 用户仍可手动再次触发
- 日期过去后不要一直循环庆祝

程序首次检测到目标日期到达时，记录：

```text
celebratedTargetDate
```

防止每次重启重复自动庆祝。

---

## 十三、配置与持久化

使用系统标准应用数据目录，不要把配置写到程序安装目录。

JSON配置即可，不需要为了简单配置引入数据库。

配置示例：

```json
{
  "targetDate": "2026-12-31",
  "countdownMode": "calendar",
  "includeToday": false,
  "includeTargetDate": true,
  "petScale": 1,
  "alwaysOnTop": true,
  "launchAtStartup": false,
  "bubbleEnabled": true,
  "bubbleIntervalMin": 20,
  "bubbleIntervalMax": 45,
  "quietHours": {
    "enabled": true,
    "start": "22:00",
    "end": "08:00"
  },
  "position": {
    "displayId": "",
    "x": 0,
    "y": 0
  }
}
```

要求：

- 配置结构带版本号
- 支持未来迁移
- 保存时使用临时文件加原子替换
- 配置损坏时备份损坏文件并恢复默认配置
- 修改设置后立即同步给宠物控制器
- 不需要重启程序

---

## 十四、设置页面

使用 react-desktop-shell，并遵循桌面端设置页风格。

页面分组：

### 倒计时

- 离职日期
- 自然日/工作日
- 是否包含今天
- 工作日配置
- 实时结果预览

### 桌宠

- 大小
- 置顶
- 动画开关
- 随机走动
- 随机跳跃
- 睡觉行为
- 移动速度
- 恢复默认位置

### 气泡

- 启用气泡
- 最短和最长间隔
- 显示时长
- 分类开关
- 自定义文案管理
- 立即预览一条

### 系统

- 开机启动
- 启动时显示
- 勿扰时间
- 托盘
- 数据目录
- 重置应用

页面底部显示：

- 应用版本
- 素材版本
- 当前平台
- 打开日志目录

---

## 十五、系统托盘

托盘菜单：

```text
显示/隐藏桌宠
立即显示倒计时
暂停/继续活动
设置
开机启动
退出
```

要求：

- 关闭设置窗口不退出应用
- 退出必须通过托盘菜单或明确的退出操作
- 防止重复启动多个实例
- 第二次启动时唤醒现有实例并打开设置

---

## 十六、性能要求

桌宠需要长期运行。

要求：

- 待机状态CPU占用尽可能低
- 不使用持续无意义的60FPS循环
- 动画根据当前帧时长更新
- 没有动画和移动时停止高频定时器
- 图片提前加载
- 不重复解码同一素材
- 限制事件日志数量
- 程序运行24小时后不能持续增长内存
- 移动更新建议30FPS，动画帧按素材实际FPS播放

不要为了简单位移动画引入完整游戏引擎。

---

## 十七、日志和错误处理

日志至少包含：

- 应用启动
- 配置加载
- 素材加载失败
- 窗口创建失败
- 自动启动设置失败
- 行为状态切换
- 平台API失败
- 倒计时目标日期变化

普通随机动作不要每帧输出日志。

提供：

```text
打开日志目录
复制诊断信息
```

诊断信息需要隐去敏感路径和用户隐私。

---

## 十八、测试

至少编写以下测试：

### Go

- 自然日倒计时
- 工作日倒计时
- 跨年和闰年
- 目标日期当天
- 目标日期已过去
- 自定义休息日和补班日
- 行为权重选择
- 行为优先级
- 屏幕边界限制
- 配置迁移
- 配置损坏恢复

### TypeScript

- 动画清单解析
- 动画帧切换
- 消息条件过滤
- 消息冷却
- 占位符替换
- 抚摸手势识别
- 点击与拖动冲突判断

不要只测试组件渲染，优先测试纯逻辑。

---

## 十九、开发阶段

按以下阶段实施，每完成一个阶段都确保可以运行。

### 第一阶段：基础窗口原型

完成：

- Wails项目结构
- 桌宠窗口
- 设置窗口
- 透明无边框
- 置顶
- 托盘
- 一张占位宠物图片
- 点击和拖拽
- 保存位置

验收：

- 宠物可以稳定显示在桌面
- 设置窗口正常打开
- 拖动后不会跑出屏幕
- 关闭设置窗口后桌宠继续运行

### 第二阶段：动画和状态机

完成：

- manifest资源格式
- AnimationPlayer
- 动画预加载
- 状态机
- 待机、走路、跳跃、睡觉
- 缺失素材回退
- sprite切割工具

验收：

- 动作切换不闪烁
- 动作不会互相冲突
- 左右走动方向正确
- 动画素材可以不修改代码直接替换

### 第三阶段：倒计时和气泡

完成：

- 自然日
- 工作日
- 消息数据结构
- 随机文案
- 气泡定位
- 阶段文案
- 自定义文案

验收：

- 日期计算准确
- 气泡不超出屏幕
- 同一文案不会频繁重复
- 修改日期后立即生效

### 第四阶段：完整互动

完成：

- 点击
- 双击
- 抚摸
- 拖拽
- 动作冷却
- 互动统计
- 拖拽和点击冲突处理

### 第五阶段：系统能力

完成：

- 开机启动
- 单实例
- 多显示器
- 高DPI
- Windows平台完整适配
- macOS平台适配
- 日志与诊断

### 第六阶段：完善与发布

完成：

- 设置页完善
- 默认文案库
- 首次启动向导
- 应用图标
- 构建脚本
- GitHub Actions
- Windows安装包
- macOS应用包
- README
- 素材说明
- 隐私说明

---

## 二十、首次启动向导

首次启动时不要直接让桌宠乱跑。

向导步骤：

1. 欢迎页面
2. 设置目标日期
3. 选择自然日或工作日
4. 选择桌宠大小
5. 是否开机启动
6. 完成并显示桌宠

完成前允许预览：

```text
距离解放还有 123 天
```

---

## 二十一、验收标准

最终版本必须满足：

- 应用启动后显示透明桌宠
- 桌宠不会显示白色或黑色背景
- 桌宠能待机、走路、跳跃和睡觉
- 桌宠可以被点击、抚摸和拖动
- 桌宠会随机显示倒计时气泡
- 倒计时计算具有明确且可配置的规则
- 气泡不会跑出屏幕
- 桌宠不会移动到任务栏外或丢失
- 多显示器和高DPI下位置基本正确
- 设置修改即时生效
- 关闭设置窗口不会退出程序
- 托盘可以暂停、隐藏和退出
- 重启后保留设置和位置
- 当天可以播放庆祝动画
- 缺失某组动画时应用仍可以运行
- 应用可以长时间运行，不明显占用CPU和内存

---

## 二十二、实施要求

开始编码前：

1. 检查当前仓库结构
2. 检查Wails版本
3. 检查现有依赖
4. 确认多窗口能力
5. 确认各平台透明窗口能力
6. 给出需要新增和修改的文件清单

实施过程中：

- 不要一次提交巨量无法审查的修改
- 每个阶段单独提交
- 不要为了抽象而抽象
- 不引入Electron
- 不引入游戏引擎
- 不接入云服务和AI接口
- 不添加账号系统
- 不添加商店和养成系统
- 保持核心功能离线可用
- 优先保证Windows版本稳定
- 对Wails缺少的功能使用小范围平台原生代码
- 每完成一个阶段运行构建和测试
- 不要只写计划，需要实际完成代码

建议提交顺序：

1. `feat: scaffold desktop pet windows and tray`
2. `feat: add pet animation asset system`
3. `feat: implement pet behavior state machine`
4. `feat: add countdown and message engine`
5. `feat: add pet interactions and dragging`
6. `feat: add settings and persistence`
7. `feat: add platform integrations`
8. `chore: add builds documentation and release workflow`

完成后输出：

- 实际修改的文件
- 已实现功能
- 未完成的平台差异
- 测试结果
- 构建结果
- 后续需要补充的动画素材清单
```

---

## 这张基础模型怎么处理

建议放到：

```text
frontend/public/pets/lulu/reference/character-reference.jpeg
```

它只负责锁定角色外观。真正开始运行至少还需要这些素材：

```text
idle       4帧
walk       6帧
jump       6帧
sleep      4帧
petting    4帧
clicked    4帧
dragged    1帧
speaking   2～4帧
celebrate  6帧
```

在这些素材没齐之前，让 Codex 使用同一张透明正面角色图，加轻微缩放、上下浮动和水平移动作为临时占位，不能拿四视图里不同角度的角色拼成动画。
