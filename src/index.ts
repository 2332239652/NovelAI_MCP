#!/usr/bin/env node

/**
 * NovelAI MCP Server — Full API Feature Set
 * Supports: txt2img, img2img, Vibe Transfer (V4.5 / V5), Precise Reference (V4.5 only),
 *           Inpainting, multi-character, transparent background (V5)
 * V5-audit: 2026-08-25 —— 对齐官方 OpenAPI 与抓包行为（params_version/Variety+/AIC/透明背景）
 * 参考图复核: 2026-09-14 —— 官方 encode-vibe 对 nai-diffusion-5-full 按标准 2 Anlas 计价（同 V4.5）、
 *           文档措辞改「V4 or higher」→ Vibe Transfer 已支持 V5；Precise Reference 仍 V4.5 专属
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { NovelAIClient } from './novelai-client.js';
import type { ImageGenerationParams, CharacterPrompt } from './types.js';

/**
 * 解析 NOVELAI_API_KEY —— **以凭据文件为准，环境变量仅作兜底**。
 *
 * 背景（2026-09-11/13 实测，代价惨重）：
 *  1. Node 的 `loadEnvFile` 遵循 `--env-file` 语义，**已存在的环境变量优先于 .env**；
 *  2. 本机 Windows 用户级环境变量里残留过一个**已失效**的 NOVELAI_API_KEY，
 *     它会一直压住 .env 的值，导致重启多少次都 401（且值格式正常，不是空串也不是 "undefined"）；
 *  3. DSH 用 `!!js process.env.NOVELAI_API_KEY` 注入，继承的正是这个失效值。
 * 因此这里反过来：先读 $DSH_HOME/.env 与 .credentials.yaml，读不到才用环境变量。
 * 换 key 时只需改凭据文件，无需依赖任何环境变量传播。
 */
function resolveApiKey(): { key: string; source: string } | undefined {
  const home = process.env.DSH_HOME || path.join(process.env.USERPROFILE || '', '.dsh');

  for (const file of [path.join(home, '.env'), path.join(home, '.credentials.yaml')]) {
    try {
      const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
      const m = text.match(/^\s*NOVELAI_API_KEY\s*[:=]\s*["']?([^\s"']+)["']?\s*$/m);
      if (m && m[1]) return { key: m[1], source: path.basename(file) };
    } catch {
      /* 文件不存在或不可读 → 继续试下一个 */
    }
  }

  const fromEnv = process.env.NOVELAI_API_KEY;
  if (fromEnv && fromEnv !== 'undefined' && fromEnv.trim() !== '') {
    return { key: fromEnv.trim(), source: 'env' };
  }
  return undefined;
}

const resolved = resolveApiKey();
if (!resolved) {
  console.error('❌ Error: 读不到 NOVELAI_API_KEY（.env / .credentials.yaml / 环境变量均不可用）');
  process.exit(1);
}
const API_KEY = resolved.key;

// 诊断日志：只输出长度与来源，绝不输出密钥内容
{
  const envRaw = process.env.NOVELAI_API_KEY;
  const envNote = envRaw
    ? `envLen=${envRaw.length}${envRaw === API_KEY ? '' : ' (env 与所用 key 不同，已按文件优先)'}`
    : 'env=(unset)';
  console.error(`🔑 API key ready: len=${API_KEY.length} source=${resolved.source} ${envNote}`);
}

const client = new NovelAIClient(API_KEY);

const server = new Server(
  {
    name: 'novelai-mcp-server',
    version: '2.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Read a file (local path or URL) and return its base64 content.
 * If already base64 data URI, strip the prefix.
 */
function loadImageBase64(source: string): string {
  if (!source) return '';
  if (source.startsWith('data:image')) {
    return source.replace(/^data:image\/\w+;base64,/, '');
  }
  if (source.startsWith('http://') || source.startsWith('https://')) {
    throw new Error('URL image loading not supported yet, use local file path');
  }
  if (!fs.existsSync(source)) {
    throw new Error(`Image file not found: ${source}`);
  }
  return fs.readFileSync(source).toString('base64');
}

const GENERATE_IMAGE_TOOL: Tool = {
  name: 'generate_image',
  description: `使用 NovelAI 生成图片，默认模型为 V5 Full（nai-diffusion-5-full），也可选 V5 Curated、V4.5 Full/Curated 及各 inpainting 变体。支持文生图、图生图 (img2img)、Inpainting 局部重绘、透明背景（V5）、Vibe Transfer（V5 与 V4.5 均支持；走 Anlas 计费，不消耗 V5 免费电量）、Precise Reference（仅 V4.5）。V5 生成默认走镜像代理，可用 NOVELAI_USE_PROXY=false 切回官方直连。

何时调用：
- 用户要求「生成」「画」「创建」图片时
- 用户要求风格迁移（Vibe Transfer，V5/V4.5 均可）或角色一致（Precise Reference，仅 V4.5）时
- 用户要求以某张图为基础修改（img2img）或局部重绘（inpainting）时

重要：当用户请求图片时立即调用此工具，不要犹豫。

官方参数事实（2026-08 审计：docs.novelai.net + image.novelai.net/docs/doc.json + 官方抓包逆向）：
- V5 采用 Qwen 分词器：英文/日语为训练重点，中文可用但效果降级；token 上限 Full≈1471/Curated≈703 为社区观察值（未获官方证实）
- 多角色：V5 最多 32 个角色框（官方测试 22 个稳定同屏；实操 4-6 人最稳），自由连续坐标 (0-1)，锚点≈肩部；V4.5 最多 6 个（5×5 网格语义）。数量标签写 base_prompt，角色框内用 girl/boy 不带数字
- 文字渲染（Text: 必须放提示词最末）：V4/V4.5 官方口径 ≤120 字符；V5 支持英/日/中文字与更长文本（约 750 字符为观察值未证实）；引号「"…"」「…」会被前端自动转成 Text: 块
- 推荐参数：V5 = Euler Ancestral（实质唯一推荐）+ Steps 20-23 + CFG≈5（区间 5-6，多画师混合可再降）；V4.5 = DPM++ 2M 或 Euler Ancestral + Steps 28 + CFG 6
- V5 能力边界（2026-09-14 复核）：Inpainting 仅 nai-diffusion-5-full-inpainting 原生支持（V5 Curated 重绘由官方路由到 V4.5 Curated Inpainting，限 6 角色）；Vibe Transfer 已支持 V5（官方 encode-vibe 对 V5 按标准 2 Anlas 计价、文档措辞为「V4 or higher」），Precise Reference 仍仅 V4.5（文档明示）。参考图功能按 Anlas 计费，0 Anlas 时报 402，免费电量不覆盖
- 免费额度（Opus 订阅）：V5 改每周电量制 ≈1730 张满电、≈190 张/天恢复，条件 ≤28 步 + 常规分辨率 + 单张不批量，耗尽后自动扣 Anlas（大尺寸高步数单价极高，如 1408×2112@49 步 ≈140 Anlas/张）；单请求上限 4 张。参考图（Vibe 编码 2 Anlas/张）等增值功能按 Anlas 计费、不消耗免费电量
- ⚠️ 速率限制（2026-09-11 用户实测确定）：**两次生成之间必须至少间隔 46 秒**。同一会话内两次调用间隔不足约 45 秒时，服务端会返回 403 拒绝（实测临界值就是 45 秒），因此硬性要求 ≥46 秒。**严禁并发调用**——同一轮里发起多个生成调用必然触发 403。需要连抽多张时逐张串行等待，并在发出下一张前确认已过 46 秒。`,

  inputSchema: {
    type: 'object',
    properties: {
      // ──── 模型选择 ────
      model: {
        type: 'string',
        default: 'nai-diffusion-5-full',
        enum: [
          'nai-diffusion-5-full',
          'nai-diffusion-5-curated',
          'nai-diffusion-5-full-inpainting',
          'nai-diffusion-4-5-full',
          'nai-diffusion-4-5-curated',
        ],
        description: '生成模型。默认 nai-diffusion-5-full。V5 Curated 更精炼/画风稳/限制多；V5 Full 表现最广。注意：不存在 nai-diffusion-5-curated-inpainting——V5 Curated 局部重绘请直接用 nai-diffusion-4-5-curated（API 会按官方行为路由到 V4.5 Curated Inpainting）。'
      },

      // ──── 核心提示词 ────
      base_prompt: {
        type: 'string',
        description: '全局提示词：场景、氛围、画风、质量标签、数量标签（1girl/2girls）。V5 建议自然语言+英文标签混排（日文也可），角色描述放 characters 里；需要画面文字时在提示词末尾写 Text: ...（必须最后，其后内容会被画进图里；引号文字会被前端自动转换）。'
      },
      base_negative_prompt: {
        type: 'string',
        description: '全局负面提示词（UC）。不填时使用默认清单（官方 Light 预设文本：「lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page」）。人物图推荐官方 Human Focus 预设（在 Light 基础上加 film grain、chromatic aberration、dithering、halftone、screentone、logo 与 @_@, mismatched pupils, glowing eyes, bad anatomy）。定向去除某物用负数值强调放进 prompt 而非 UC（如 -1::hat::；V4.5+/V5 有效，-1~-3 安全）。'
      },

      // ──── 多角色 ────
      aic: {
        type: 'boolean',
        default: false,
        description: '多角色自动排布（AI\'s Choice 等价物）。true=忽略所有 center 坐标，模型自由决定角色站位（对应网页端 AIC 开关，use_coords=false）；false/缺省=使用 center 坐标。多个角色都不传 center 时自动视为 aic=true。'
      },
      characters: {
        type: 'array',
        description: '角色数组。V5 最多 32 个（官方测试 22 个稳定；实操 4-6 人最稳），V4.5 上限 6 个。单人场景传 1 个，多人传多个。数量标签（2girls 等）必须放 base_prompt，角色框 prompt 用 girl/boy 不带数字。V5 使用自由连续坐标 (0-1)（锚点≈人物肩部），摆放顺序尽量与角色框顺序一致并用自然语言二次强调；可给每个角色单独 negative_prompt 防串味。',
        items: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: '该角色的详细描述。例：「1girl, blue hair, school uniform, smiling」' },
            negative_prompt: { type: 'string', description: '该角色专属额外负面提示词' },
            center_x: { type: 'number', description: '水平位置 0-1。0=左, 0.5=中, 1=右（V5 锚点≈肩部）' },
            center_y: { type: 'number', description: '垂直位置 0-1。0=顶, 0.5=中, 1=底。默认 0.5' },
          },
          required: ['prompt'],
        },
      },

      // ──── 分辨率 ────
      width: {
        type: 'number', default: 832,
        description: '图片宽度（像素），64-1536 且为 64 的倍数。常用：832（竖图）、1216（横图）、1024（方图）'
      },
      height: {
        type: 'number', default: 1216,
        description: '图片高度（像素），64-1536 且为 64 的倍数。'
      },

      // ──── 采样参数 ────
      steps: {
        type: 'number',
        description: '采样步数，1-50。不填时按模型自动选择：V5 默认 23，V4.5 默认 28。社区稳定带 20-23；Opus 免费条件：≤28 步 + 常规分辨率 + 单张不批量（耗 V5 每周电量，约 1730 张满电）。低步数先看构图，满意后用 Enhance 细化。'
      },
      scale: {
        type: 'number',
        description: 'Prompt Guidance（提示词相关性），0-10。不填时按模型自动选择：V5 默认 5（官方推荐区间 5-6；多画师混合可降至 3.5-4），V4.5 默认 6。越高越贴合提示词但易过饱和锐利，越低越柔和/绘画感；高 Guidance 时建议配合 cfg_rescale 0.5-0.7 或开启 Decrisper。'
      },
      sampler: {
        type: 'string', default: 'k_euler_ancestral',
        enum: ['k_euler', 'k_euler_ancestral', 'k_dpmpp_2s_ancestral', 'k_dpmpp_2m', 'k_dpmpp_sde', 'ddim_v3'],
        description: '采样器。V5 实质唯一推荐 Euler Ancestral（网页端 ddIM 等会被重映射为它）；V4.5 官方推荐 DPM++ 2M 与 Euler Ancestral。注意：采样器非确定性，同一 seed 无法 100% 复现。'
      },
      seed: {
        type: 'number',
        description: '随机种子（0-4294967295）。固定 seed 可在相同设置下近似复现图片（采样器非确定性，非 100%）；seed 会写入下载文件名与 Exif。不填则随机。'
      },
      n_samples: {
        type: 'number', default: 1,
        description: '一次生成几张图，1-4（官方单请求上限 4 张；批量会消耗 Anlas，Opus 免费仅限单张）。注意：多个样本放在一个 ZIP 里返回，目前只取第一张。'
      },
      noise_schedule: {
        type: 'string', default: 'karras',
        enum: ['native', 'karras', 'exponential', 'polyexponential'],
        description: '噪声调度。⚠️ V5 强制 karras（官方 UI 无选择器，传其他值会被覆盖为 karras）；native 仅适用于 V3 及以下；V4.5 推荐 karras。'
      },

      // ──── 质量与高级参数 ────
      quality_toggle: {
        type: 'boolean', default: true,
        description: '是否自动追加官方质量标签（Add Quality Tags）。V5 Standard 档追加「very aesthetic, masterpiece, no text」、Light 档追加「very aesthetic, amazing quality, no text」（V5 无 UI 选择档位，本工具按 Standard 处理）；V4.5 Full 追加「location, very aesthetic, masterpiece, no text」。注意含 no text 标签——短文字渲染不显示时请关闭本选项；生成特定风格/NSFW 时也可关闭。'
      },
      uc_preset: {
        type: 'number', default: 0,
        description: '官方 UC 预设 ID（UI 状态记录字段）。注意：各档位数值语义在不同资料中不一致（实测口径：0=Heavy / 1=Light / 2=Furry / 3=Human / 4=None），实际生效的负面文本以 base_negative_prompt 显式传入为准，此字段仅随请求记录。保持默认 0 即可。'
      },
      auto_smea: {
        type: 'boolean', default: false,
        description: 'Auto SMEA：仅 V3 及以下模型有效（V4/V4.5/V5 已移除 SMEA，V5 请求不会发送 sm/sm_dyn）。保留参数仅为兼容旧调用。'
      },
      cfg_rescale: {
        type: 'number', default: 0,
        description: 'Prompt Guidance Rescale，0-1。缓解高 Guidance 下的色彩过饱和/"deepfried"问题；高 Guidance 时建议 0.5-0.7。'
      },
      image_format: {
        type: 'string', default: 'png',
        enum: ['png', 'jpg', 'webp'],
        description: '输出图片格式。⚠️ 需要 V5 透明背景时必须用 png（jpg 会丢 alpha 通道）。'
      },
      variety: {
        type: 'boolean', default: false,
        description: 'Variety+ 开关：true 时发送 skip_cfg_above_sigma=58（增加构图多样性）；官方默认关闭。对结果有细微影响，追求与官网默认一致时保持 false。'
      },
      transparent_background: {
        type: 'boolean', default: false,
        description: 'V5 专属透明背景：true 时自动在提示词追加官方透明标签并设置 straight_alpha + tag_hint_transparent_background，输出带 alpha 通道的 RGBA PNG（立绘/贴纸素材）。需 image_format=png。提示词里也可直接写 transparent background / has alpha；fake transparency 标签则用于画棋盘格假透明。'
      },

      // ──── 图生图 (img2img) ────
      image: {
        type: 'string',
        description: 'img2img 基础图（本地文件路径或 base64 字符串）。提供此参数后自动切换为 img2img 模式。Strength = AI 可重新诠释原图的程度；Noise = 允许添加新细节的程度（两者都最小 ≈ 原图完美复刻，即官方 Enhance/Upscale 的原理）。'
      },
      strength: {
        type: 'number', default: 0.6,
        description: 'img2img Strength 0-1（官方 API 默认 0.7）。越高 AI 自由诠释越多（可能改变配色/主体），越低越贴近原图。提示词被忽略时应提高 Prompt Guidance 而非此值。'
      },
      noise: {
        type: 'number', default: 0,
        description: 'img2img Noise 0-1。允许 AI 补充新细节（如补全缺失背景）。反复高噪声生成会累积伪影。'
      },

      // ──── Vibe Transfer（V4.5/V5）/ Precise Reference（仅 V4.5） ────
      reference_images: {
        type: 'array',
        items: { type: 'string' },
        description: '参考图（本地文件路径数组）。vibe 模式（Vibe Transfer）V5 与 V4.5 均支持；precise 模式（Precise Reference）仅 V4.5 系列模型——对 V5 传 precise 参考会失败。参考图功能按 Anlas 计费（Vibe 编码 2 Anlas/张），不消耗 V5 免费电量。precise 模式：建议 ≤4 张（费用随数量增加），多张角色参考会融合成一个角色（不是多个角色）。vibe 模式：最多 16 张，超过 4 张每张 +2 Anlas；多张 vibe 的 strength 总和建议 ≤1.0。参考图会被自动适配到 1024×1536 / 1472×1472 / 1536×1024 三种画布之一（小图放大+补边）。'
      },
      reference_mode: {
        type: 'string',
        default: 'precise',
        enum: ['precise', 'vibe'],
        description: '参考模式。precise=Precise Reference（角色/风格精确参考，仅 V4.5 支持，每次生成 +5 Anlas；与 Vibe Transfer 互斥二选一），vibe=Vibe Transfer（风格迁移，V5 与 V4.5 均支持；多张强度总和 ≤1.0）。参考图功能按 Anlas 计费，不消耗 V5 免费电量。'
      },
      reference_mode_detail: {
        type: 'string',
        default: 'character_style',
        enum: ['character_style', 'character', 'style'],
        description: '精确参考的详细模式（仅 reference_mode=precise 时生效）。character_style=角色和风格，character=仅角色外观，style=仅画风。'
      },
      reference_strength: {
        type: 'number', default: 0.6,
        description: '参考强度 0-1（官方默认 0.6 为平衡值）。越高越贴合参考图（precise 过高会使表情/姿势过度相似；vibe 多张时总和建议 ≤1.0）。precise 模式可填负值（用于处理不理想的参考图）。'
      },
      reference_fidelity: {
        type: 'number', default: 1,
        description: '参考保真度 0-1（仅 precise 模式生效）。1=强制贴合参考、难以用 prompt 覆盖；0=灵活可覆盖。'
      },

      // ──── Inpainting ────
      mask: {
        type: 'string',
        description: 'Inpainting 蒙版（本地黑白图片路径或 base64）。白色区域会被重新绘制。必须与 image 参数一起使用；官方支持与 Precise Reference 联动。'
      },
      inpaint_strength: {
        type: 'number', default: 1,
        description: 'Inpainting 强度 0-1。1=完全重绘蒙版区域。'
      },
    },
    required: ['base_prompt'],
  },
};

const CHECK_BALANCE_TOOL: Tool = {
  name: 'check_balance',
  description: '查询 NovelAI 账户信息：Anlas 点数余额 + V5 每周电量（剩余百分比、折合张数、恢复速度）。优先走官方 image.novelai.net/user/subscription，不可达时自动回退镜像站。无需参数。',
  inputSchema: { type: 'object', properties: {} },
};

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: [GENERATE_IMAGE_TOOL, CHECK_BALANCE_TOOL] };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'generate_image') {
    try {
      let args = request.params.arguments as any;
      if (typeof args === 'string') {
        try { args = JSON.parse(args); } catch (e) { throw new Error('JSON Parse Error'); }
      }

      const actualPrompt: string = args.base_prompt || args.prompt || args.input;
      if (!actualPrompt) throw new Error('Missing base_prompt');

      // V5 透明背景：对齐官方 UI 行为，向提示词追加官方透明标签
      let finalPrompt = actualPrompt;
      if (args.transparent_background === true && !/transparent background|has alpha/i.test(actualPrompt)) {
        finalPrompt = `${actualPrompt}, transparent background, has alpha`;
      }

      // Characters
      let charArray = [];
      if (Array.isArray(args.characters)) {
        charArray = args.characters;
      } else if (args.characters && typeof args.characters === 'object') {
        charArray = [args.characters];
      }
      // AI's Choice：顶层 aic=true 强制全员 AIC；未声明坐标的角色自动视为 AIC
      const forceAic = args.aic === true;
      const characterPrompts: CharacterPrompt[] = charArray.map((char: any) => ({
        prompt: char.prompt,
        uc: char.negative_prompt || "",
        center: { x: char.center_x ?? 0.5, y: char.center_y ?? 0.5 },
        enabled: true,
        aic: forceAic || (char.center_x === undefined && char.center_y === undefined),
      }));

      // Determine action
      const hasImg2Img = !!args.image;
      const action = hasImg2Img ? 'img2img' : 'generate';

      // Base parameters
      const apiParams: ImageGenerationParams = {
        prompt: finalPrompt,
        negative_prompt: args.base_negative_prompt || "lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page",
        characterPrompts,
        model: (args.model as ImageGenerationParams['model']) || (process.env.NOVELAI_MODEL as ImageGenerationParams['model']) || 'nai-diffusion-5-full',
        action,
        width: args.width || 832,
        height: args.height || 1216,
        steps: args.steps,
        seed: args.seed ?? Math.floor(Math.random() * 4294967295),
        scale: args.scale,
        sampler: args.sampler || 'k_euler_ancestral',
        n_samples: Math.min(args.n_samples ?? 1, 4),
        noise_schedule: args.noise_schedule || 'karras',
        qualityToggle: args.quality_toggle ?? true,
        ucPreset: args.uc_preset ?? 0,
        autoSmea: args.auto_smea ?? false,
        cfg_rescale: args.cfg_rescale ?? 0,
        image_format: args.image_format || 'png',
        // Variety+：官方默认关闭；仅当 variety=true 时发送 skip_cfg_above_sigma=58
        skip_cfg_above_sigma: args.variety === true ? 58 : undefined,
        prefer_brownian: true,
        transparent_background: args.transparent_background === true,
      };

      // img2img
      if (args.image) {
        apiParams.image = loadImageBase64(args.image);
        apiParams.strength = args.strength ?? 0.6;
        apiParams.noise = args.noise ?? 0;
        console.error(`🖼️  Img2Img mode, strength=${apiParams.strength}`);
      }

      // Precise Reference / Vibe Transfer
      if (args.reference_images && args.reference_images.length > 0) {
        const mode = args.reference_mode || 'precise';
        const str = args.reference_strength ?? 0.6;
        if (mode === 'precise') {
          // Precise Reference（角色/风格精确参考）
          apiParams.precise_references = args.reference_images.map((ref: string) => ({
            image: loadImageBase64(ref),
            mode: args.reference_mode_detail || 'character_style',
            strength: str,
            fidelity: args.reference_fidelity ?? 1,
            enabled: true,
          }));
          const refs = apiParams.precise_references!;
          console.error(`🎯 Precise Reference: ${refs.length} ref(s), mode=${refs[0].mode}, strength=${str}`);
        } else {
          // Vibe Transfer（风格迁移）
          apiParams.reference_image_multiple = args.reference_images.map((ref: string) => loadImageBase64(ref));
          apiParams.reference_strength_multiple = args.reference_images.map(() => str);
          apiParams.reference_information_extracted_multiple = args.reference_images.map(() => 1);
          apiParams.normalize_reference_strength_multiple = true;
          console.error(`🎨 Vibe Transfer: ${args.reference_images.length} reference(s), strength=${str}`);
        }
      }

      // Inpainting
      if (args.mask) {
        if (!args.image) throw new Error('Inpainting requires both image and mask');
        apiParams.mask = loadImageBase64(args.mask);
        apiParams.inpaintImg2ImgStrength = args.inpaint_strength ?? 1;
        apiParams.action = 'infill';
        console.error(`🔧 Inpainting mode`);
      }

      // Log key params
      console.error(`🎨 Generating... model=${apiParams.model} seed=${apiParams.seed} cfg=${apiParams.scale ?? 'auto'} steps=${apiParams.steps ?? 'auto'} sampler=${apiParams.sampler} ${apiParams.precise_references ? 'precise-ref-via-proxy' : hasImg2Img ? 'img2img' : 'txt2img'}`);

      const imageBuffer = apiParams.precise_references
        ? await client.generateImageViaProxy(apiParams)
        : await client.generateImage(apiParams);

      // Process image data
      const isZip = imageBuffer[0] === 0x50 && imageBuffer[1] === 0x4B;
      const isPng = imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50;
      const isWebp = imageBuffer[8] === 0x57 && imageBuffer[9] === 0x45;
      const isJpg = imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8;

      let base64Image = '';

      if (isZip) {
        const zip = new AdmZip(imageBuffer);
        const zipEntries = zip.getEntries();
        for (const entry of zipEntries) {
          if (entry.entryName.endsWith('.png') || entry.entryName.endsWith('.jpg') || entry.entryName.endsWith('.webp')) {
            base64Image = entry.getData().toString('base64');
            console.error(`📦 Extracted: ${entry.entryName}`);
            break;
          }
        }
        if (!base64Image) throw new Error('No image found in ZIP');
      } else if (isPng || isJpg || isWebp) {
        base64Image = imageBuffer.toString('base64');
      } else {
        throw new Error('Unknown image format');
      }

      const cleanBase64 = base64Image.replace(/[\r\n]+/g, '');

      // Save to disk
      const DEFAULT_SAVE_DIR = path.join(
        process.env.USERPROFILE || process.env.HOME || '.',
        'Desktop',
        'NovelAI_Output'
      );
      const saveDir = process.env.NOVELAI_SAVE_DIR || DEFAULT_SAVE_DIR;
      let savedPath = '';
      if (saveDir) {
        try {
          if (!fs.existsSync(saveDir)) {
            fs.mkdirSync(saveDir, { recursive: true });
          }
          const ext = args.image_format || 'png';
          const filename = `novelai_${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
          savedPath = path.join(saveDir, filename);
          fs.writeFileSync(savedPath, Buffer.from(cleanBase64, 'base64'));
          console.error(`📁 Saved: ${savedPath}`);
        } catch (e) {
          console.error(`⚠️ Failed to save:`, e);
        }
      }

      return {
        content: [
          {
            type: 'image',
            data: cleanBase64,
            mimeType: `image/${args.image_format || 'png'}`,
          },
          ...(savedPath ? [{ type: 'text' as const, text: `图片已保存至: ${savedPath}` }] : []),
        ],
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Error:', errorMessage);
      return {
        content: [{ type: 'text', text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  if (request.params.name === 'check_balance') {
    try {
      const acct = await client.checkAccount();
      const parts = [`Anlas 余额: ${acct.anlas.toLocaleString()}`];
      if (typeof acct.batteryPercent === 'number') {
        const remainImages = Math.round(acct.batteryPercent * 17.3);
        parts.push(`V5 电量: ${acct.batteryPercent}%（≈剩余 ${remainImages} 张）`);
        if (acct.refillSecondsPerPercent && acct.refillSecondsPerPercent > 0) {
          const hoursPerPercent = acct.refillSecondsPerPercent / 3600;
          const perDay = Math.round((24 / hoursPerPercent) * 17.3);
          parts.push(`恢复速度: 约 ${hoursPerPercent.toFixed(1)} 小时 +1%（≈每天 ${perDay} 张）`);
        }
      } else if (acct.source === 'mirror') {
        parts.push('（V5 电量仅官方接口提供，本次经镜像站回退查询）');
      }
      parts.push(`来源: ${acct.source === 'official' ? '官方接口' : '镜像站'}`);
      return {
        content: [{ type: 'text', text: parts.join('；') }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `查询失败: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('NovelAI MCP Server v2.0 running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
