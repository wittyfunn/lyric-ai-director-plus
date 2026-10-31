# AI 歌词动画导演 Plus

Folia 的模组：让 AI 先读懂一首歌的情绪、意象和起伏，再为它挑选最贴合的歌词动画模式和参数，换歌时自动切换。

基于 [duoduo1232/lyric-ai-director](https://github.com/duoduo1232/lyric-ai-director)（MIT）重写：原版直接让 AI 从模式列表里挑一个，Plus 把“理解歌曲”和“挑选模式”分开，并加上本地打分、记忆、提前准备、口味学习等，选得更准，也更省钱。

![预览](lyric-ai-director-plus/preview.jpg)

## 它做什么

1. **理解整首歌**（第 1 步，每首歌只做一次）：AI 读歌名、歌手和整首歌词，写出一份“简报”：一句话概括、情绪、风格标签、意象、能量起伏，以及运动感、密度、温度、纵深、叙事五个画面维度的打分。
2. **本地打分**（不调用 AI）：把简报和每个内置模式的“画像”（画面特点、适合和不适合的歌）对照打分，选出最合适的 3 个候选。
3. **AI 定稿**（第 2 步）：AI 对照候选的详细画像，选出一个模式，并给出 2～5 个让画面更贴合的参数。
4. **在合适的时机切换**：只在第一句歌词之前、歌词空隙里或暂停时切换，不会在唱到一半时突然换画面。

此外：

- **记住每首歌**：听过的歌直接套用，不再调用 AI。
- **提前准备下一首**：当前这首放着时，就在后台把队列里的下一首决定好，切歌时直接换上。
- **智能动感**（Folia 0.7.23 起）：打开 Folia 的智能动感后，AI 会同时决定当前模式的鼓点效果（例如凝彩的“墨染奥行”）开不开、开多强。插件不会替你打开智能动感本身。
- **学习你的口味**：你手动换模式、点 👍 / 👎，都会被记下来，之后遇到气质相似的歌会参考。
- **随时可以接管**：在面板的本地打分前 5 名里点「换成」，或者直接在 Folia 里换模式，AI 会按这首歌给你选的模式调参数（只花 1 次调用），这首歌以后都用你的选择和这套参数。“恢复原来的设置”可以一键回到你原来的模式和参数。
- **用量看得见**：面板里显示每首歌和累计的调用次数、token 和花费。

## 安装

- **模组市场**：在 Folia 的模组市场里搜索“AI 歌词动画导演 Plus”。
- **手动安装**：下载 Release 里的 `lyric-ai-director-plus-<版本>.zip`，拖进 Folia 的“设置 → 模组”。

需要 Folia 0.7.22 及以上的 0.7.x 版本。

## 设置

打开“设置 → 模组 → AI 歌词动画导演 Plus”：

1. **服务商**：选你在用的。支持任何兼容 OpenAI 接口的服务，已内置 OpenAI、DeepSeek、阿里云百炼（通义千问）、智谱 GLM、Kimi、火山方舟（豆包）、硅基流动、OpenRouter、Google Gemini，以及本机的 Ollama、LM Studio。列表里没有的选“自定义”，填接口地址。
2. **API 密钥**：本机的 Ollama、LM Studio 不用填。密钥由 Folia 加密保存，不会出现在设置导出里。
3. **模型**：在播放页的“AI 导演”面板里点“测试连接”，可以看到这个服务商有哪些模型，挑一个填进来。推荐用不带“思考”的快速模型；插件会自动关掉支持关闭的模型的思考。

其他设置：

| 设置 | 默认 | 说明 |
|---|---|---|
| 换歌时自动决策 | 开 | 关掉后只在你点“为这首歌决策”时工作 |
| 同时调整参数 | 开 | 关掉后只切换模式 |
| 同时调整智能动感 | 开 | 需要先在 Folia 的“歌词样式 → 全局”里打开智能动感 |
| 学习我的口味 | 开 | 记录最近 30 条反馈，可在面板里清除 |
| 记住每首歌的选择 | 开 | |
| 提前为下一首做准备 | 开 | 只支持在线歌曲 |
| 省钱模式 | 关 | 本地打分明显领先时跳过第 2 步；评测显示这会降低准确率 |
| 偏好提示 | 空 | 例如“整体安静一点”“少用群唱” |
| 花费显示 | 人民币、单价 0 | 填上服务商的单价，面板里就显示花费 |

## 面板与命令

播放页右侧的“AI 导演”面板显示：这首歌的状态、选择和理由、简报、本地打分前 5 名、下一首的准备情况、用量，以及你的口味记录。

按钮和命令面板（Ctrl+K，搜“AI 导演”）里的命令：为这首歌决策、重新挑选模式、重新理解整首歌、👍 合适、👎 不合适换一个、恢复原来的设置、测试连接。

## 花费

以 DeepSeek 为例，一首新歌约 2,400 输入 + 330 输出 token，不到 1 分钱；听过的歌不再花钱。实际价格以你的服务商为准。

## 隐私

- **发给 AI 的内容**：歌名、歌手、专辑、整首歌词、歌词的结构数据（行数、副歌位置等），以及当前播放器主题的名字和描述。只发给你在设置里填的那个接口地址。
- **不会发送**：音频、你的账号信息、播放记录，也不会发给任何其他地方。插件不下载或执行远程代码。
- **存在本机的**：每首歌的简报和选择、口味记录、用量统计，都在 Folia 给这个模组的数据目录里（`mod-data.json`，上限 1 MB，最多记 600 首歌）。

## 权限

| 权限 | 用途 |
|---|---|
| `net.fetch` | 调用你配置的 AI 接口（以及“测试连接”时读取模型列表）。不访问其他地址 |
| `filesystem.data` | 在模组自己的数据目录里保存记忆、口味记录和用量 |

插件还用到了 Folia 的**内部接口**（`folium.internals`），用来读取和切换歌词动画模式、调整模式参数和智能动感效果，因为公开接口里还没有这些能力。所以 Folia 的模组面板会标出“使用内部接口”，`mod.json` 也把兼容版本限定在 0.7.x。Folium 2 会去掉内部接口，到时需要更新插件。

## 开发

源码在 `src/`，用 `node dev/build.mjs` 打包成单文件 `lyric-ai-director-plus/client.mjs`（Folia 只给入口文件加版本号，单文件可以避免更新后读到旧的子模块）。

```sh
node dev/build.mjs      # 打包发布版
node dev/build.mjs --dev  # 打包带评测工具的开发版
node dev/unit.mjs       # 单元测试
```

`dev/harness-plus.html` 是模拟宿主的集成测试：在项目根目录运行 `python -m http.server 8766`，打开 `http://localhost:8766/dev/harness-plus.html`。

评测集（`src/eval-set.mjs`，42 首歌，只存歌名和歌手，歌词评测时在线获取）只在开发版里：用 `node dev/build.mjs --dev` 打包，装进 Folia 后在设置里打开“显示评测工具”，就能在面板和命令面板里运行。发布版不带评测集和评测代码。

## 许可

MIT。参数白名单和部分请求处理改编自 duoduo1232/lyric-ai-director（MIT），见 `lyric-ai-director-plus/LICENSE`。

---

**English**: A Folia mod that lets an AI read a whole song (lyrics, mood, imagery, energy) and pick the lyric animation mode and parameters that fit it best, switching only between lines. Works with any OpenAI-compatible API (OpenAI, DeepSeek, Qwen, GLM, Kimi, Doubao, SiliconFlow, OpenRouter, Gemini, or local Ollama / LM Studio). It remembers every song, prepares the next one in the queue ahead of time, sets Folia's smart-beat effects, and learns from your manual changes and 👍 / 👎. Only the song's title, artist, album, lyrics and the player theme's name are sent, and only to the endpoint you configure.
