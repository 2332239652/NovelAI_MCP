# Changelog

All notable changes to this project will be documented in this file.

## [2.1.0] - 2026-08-25

### 基于官方 OpenAPI + 抓包逆向的 NAI5 审计修复

> 依据：`image.novelai.net/docs/doc.json`（官方 OpenAPI）、官方网页抓包逆向
> （zhulinyv/Auto-NovelAI-Refactor）、NAIWeaver / GENYTOOLS 能力矩阵、
> kirafishy/NaiPromptManager 实测文档。审计报告：
> `NAI5_调研与skill审计报告.md`（本地审计文档，未随仓库分发）

### Fixed
- **删除不存在的模型 ID `nai-diffusion-5-curated-inpainting`**（官方 UI 将 V5 Curated
  局部重绘路由到 `nai-diffusion-4-5-curated-inpainting`，该模式限 6 角色）；
  Model 类型新增 `nai-diffusion-4-5-full/curated-inpainting`
- **Variety+ 不再恒开**：`skip_cfg_above_sigma: 58` 硬编码改为可选参数
  `variety`（默认 false = 不发送，对齐官方默认 null）
- **src/ 与 dist/ 失同步**：把 dist 中已生效的 AIC（AI's Choice）修复回移到 src，
  避免重新构建时丢失；`characters[].required` 改为仅 `['prompt']`
- **params_version 按模型区分**：V5=4、V4.5=3（原先对所有模型硬编码 4）
- **单请求张数上限 8 → 4**（官方单请求上限）
- **V5 强制 karras** 噪声调度（官方 UI 无选择器）
- **SMEA 字段按代发送**：V5 不发 sm/sm_dyn/auto_smea；V4.5 恒发 false；仅 V3 发 auto_smea
- **直连/代理两条路径默认值统一**（非 V5 CFG 6、img2img strength 0.6）

### Added
- **透明背景支持（V5）**：新参数 `transparent_background`（自动追加官方标签 +
  设置 `straight_alpha` + `tag_hint_transparent_background`，输出 RGBA PNG，需 png 格式）
- **Euler Ancestral 标志位对齐官方抓包**：`deliberate_euler_ancestral_bug:false` 与
  `prefer_brownian:true` 仅在 sampler=k_euler_ancestral 时发送
- img2img/enhance 补齐 `extra_noise_seed`、`color_correct:false`；payload 补 `uncond_scale:1`
- **check_balance 升级为 checkAccount**：优先官方 `/user/subscription`，返回 Anlas +
  V5 每周电量（剩余 %、≈17.3 张/%、恢复速度），官方不可达时回退镜像站

### Changed
- 工具描述全面修订：标注未证实数字（token 上限/文字长度为观察值）、Vibe/Precise 仅
  V4.5 可用、推荐参数改为 V5 CFG≈5（区间 5-6）/Steps 20-23/Euler Ancebral 唯一推荐、
  uc_preset 数值语义存疑说明、Opus 每周电量制额度说明
- 版本号 2.0.0 → 2.1.0

### Migration Notes
- 需要重启 MCP 连接后新工具描述与行为才生效
- 若有工作流显式引用 `nai-diffusion-5-curated-inpainting`，请改用
  `nai-diffusion-4-5-curated`（inpainting 由 API 路由）
- 之前依赖「Variety+ 恒开」出图的种子复现场景，现在需要显式传 `variety: true`
  才能得到与旧行为一致的结果

## [1.1.0] - 2026-01-11

### Added
- **🚀 HTTP SSE Transport Mode**: 新增 HTTP Server-Sent Events 传输模式，支持 LobeChat、Dify 等 Web 应用
  - 新增 `src/http-server.ts` - HTTP SSE 服务器实现
  - 新增 `npm run start:http` - 启动 HTTP 模式
  - 新增 `npm run start:stdio` - 显式启动 Stdio 模式
  - 新增 `npm run test:http` - HTTP 服务器测试脚本
  - HTTP 端点：`/sse` (SSE连接), `/message` (消息), `/health` (健康检查)
- **📝 工具描述优化**: 使用中文描述所有工具参数，更易理解和调整
  - 明确说明何时调用工具（「画」「生成」「创建」等关键词）
  - 详细的参数说明和示例值
  - 强调单人/多人场景都要使用 characters 数组
  - 说明 character.negative_prompt 会叠加在全局 base_negative_prompt 之上
  - 明确 steps 锁定为 28（NovelAI 免费出图限制）
- **📚 文档完善**:
  - 新增 `HTTP-MODE.md` - HTTP 模式详细文档（包含部署、Docker、PM2、Nginx等）
  - 新增 `QUICKSTART-HTTP.md` - HTTP 模式快速开始指南（5分钟上手）
  - 更新 `README.md` 添加传输模式对比和说明
- **🔧 开发依赖**:
  - 新增 `@types/express` - Express TypeScript 类型定义
  - 新增 `@types/cors` - CORS TypeScript 类型定义

### Changed
- 工具描述从英文改为中文，方便中文用户维护和调整
- 参数描述更加详细，包含范围、常用值和推荐配置
- 工具描述更加明确，帮助 AI 更准确地识别何时调用工具

### Technical Details
- 使用 Express 5.x + CORS 实现 HTTP 服务器
- 使用 MCP SDK 的 SSEServerTransport 实现流式传输
- 与 Stdio 模式保持完全相同的功能和 API
- 支持环境变量配置端口（默认 3000）
### Migration Notes
- Stdio 模式（原有功能）保持不变，完全向后兼容
- HTTP 模式是新增功能，不影响现有配置
- 可以同时运行多个实例（stdio + http）