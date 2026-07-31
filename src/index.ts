#!/usr/bin/env node

/**
 * NovelAI MCP Server — Full API Feature Set
 * Supports: txt2img, img2img, Vibe Transfer, Inpainting, ControlNet, multi-character
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

const API_KEY = process.env.NOVELAI_API_KEY;
if (!API_KEY) {
  console.error('❌ Error: NOVELAI_API_KEY environment variable is required');
  process.exit(1);
}

const client = new NovelAIClient(API_KEY);

const server = new Server(
  {
    name: 'novelai-mcp-server',
    version: '2.0.0',
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
  description: `使用 NovelAI V4.5 Full 模型生成图片。支持文生图、图生图、Vibe Transfer（参考图风格迁移）。

何时调用：
- 用户要求「生成」「画」「创建」图片时
- 用户提供参考图要求风格迁移（Vibe Transfer）时
- 用户要求以某张图为基础修改（img2img）时

重要：当用户请求图片时立即调用此工具，不要犹豫。`,

  inputSchema: {
    type: 'object',
    properties: {
      // ──── 核心提示词 ────
      base_prompt: {
        type: 'string',
        description: '全局环境和风格描述，包含整体场景、氛围、画风、质量标签等。例如：「masterpiece, best quality, detailed background, cherry blossoms」。角色描述放在 characters 里。'
      },
      base_negative_prompt: {
        type: 'string',
        description: '全局负面提示词。常用：「lowres, bad anatomy, bad hands, text, error, blurry, worst quality」'
      },

      // ──── 多角色 ────
      characters: {
        type: 'array',
        description: '角色数组。单人场景传入1个角色（x=0.5），多人传入多个。',
        items: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: '该角色的详细描述。例：「1girl, blue hair, school uniform, smiling」' },
            negative_prompt: { type: 'string', description: '该角色专属额外负面提示词' },
            center_x: { type: 'number', description: '水平位置 0-1。0=左, 0.5=中, 1=右' },
            center_y: { type: 'number', description: '垂直位置 0-1。0=顶, 0.5=中, 1=底。默认 0.5' },
          },
          required: ['prompt', 'center_x'],
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
        type: 'number', default: 28,
        description: '采样步数，1-50。28 为免费上限。'
      },
      scale: {
        type: 'number', default: 6,
        description: 'CFG 引导值（提示词相关性），0-10。5=通用，3.5=多画师混合，7-8=精确控制。越高越贴合提示词但可能过锐。'
      },
      sampler: {
        type: 'string', default: 'k_euler_ancestral',
        enum: ['k_euler', 'k_euler_ancestral', 'k_dpmpp_2s_ancestral', 'k_dpmpp_2m', 'k_dpmpp_sde', 'ddim_v3', 'ddim'],
        description: '采样器。k_euler_ancestral（通用/创意强）、k_dpmpp_2m（收敛快/细节好）、ddim_v3（稳定复现）。'
      },
      seed: {
        type: 'number',
        description: '随机种子（0-4294967295）。固定 seed 可在相同参数下复现图片。不填则随机。'
      },
      n_samples: {
        type: 'number', default: 1,
        description: '一次生成几张图，1-8。注意：多个样本会放在一个 ZIP 里返回，目前只取第一张。'
      },
      noise_schedule: {
        type: 'string', default: 'karras',
        enum: ['native', 'karras', 'exponential', 'polyexponential'],
        description: '噪声调度。karras 为通用推荐，native 为原生 SD。'
      },

      // ──── V4.5 专属 ────
      quality_toggle: {
        type: 'boolean', default: true,
        description: '是否自动追加 quality tags（very aesthetic, masterpiece 等）。生成特定风格或 NSFW 时建议关闭。'
      },
      uc_preset: {
        type: 'number', default: 0,
        description: '负面提示词预设强度，0-3。0=轻（默认），3=重（强排除）。'
      },
      auto_smea: {
        type: 'boolean', default: false,
        description: '自动 SMEA 采样（高分辨率防崩）。建议 1024px 以上开启。'
      },
      cfg_rescale: {
        type: 'number', default: 0,
        description: 'CFG 重缩放 0-1。用于缓解高 CFG 下的过锐/色彩过饱和，推荐高 CFG 时设为 0.5-0.7。'
      },
      image_format: {
        type: 'string', default: 'png',
        enum: ['png', 'jpg', 'webp'],
        description: '输出图片格式。'
      },

      // ──── 图生图 (img2img) ────
      image: {
        type: 'string',
        description: '图生图模式下作为基础的图片（本地文件路径或 base64 字符串）。提供此参数后自动切换为 img2img 模式。'
      },
      strength: {
        type: 'number', default: 0.6,
        description: '图生图降噪强度 0-1。0=几乎不变原图，0.6=保留构图改变风格，0.9=几乎脱离原图。'
      },
      noise: {
        type: 'number', default: 0,
        description: '图生图额外噪声 0-1。增加画面随机性。'
      },

      // ──── Vibe Transfer / Precise Reference（参考图风格迁移/角色参考） ────
      reference_images: {
        type: 'array',
        items: { type: 'string' },
        description: '参考图（本地文件路径数组，最多 4 张）。AI 会借鉴这些图的风格/构图/角色外观生成新图。'
      },
      reference_mode: {
        type: 'string',
        default: 'precise',
        enum: ['precise', 'vibe'],
        description: '参考模式。precise=精确参考（角色+风格，推荐用于角色一致性），vibe=风格迁移（仅风格/构图引导）。'
      },
      reference_mode_detail: {
        type: 'string',
        default: 'character_style',
        enum: ['character_style', 'character', 'style'],
        description: '精确参考的详细模式（仅 reference_mode=precise 时生效）。character_style=角色和风格，character=仅角色外观，style=仅画风。'
      },
      reference_strength: {
        type: 'number', default: 0.6,
        description: '参考强度 0-1。0.6 为平衡值，越高越贴近参考图。'
      },
      reference_fidelity: {
        type: 'number', default: 1,
        description: '参考保真度 0-1（仅 precise 模式生效）。1=最大保真。'
      },

      // ──── Inpainting ────
      mask: {
        type: 'string',
        description: '修复蒙版（本地黑白图片路径或 base64）。白色区域会被重新绘制。必须与 image 参数一起使用。'
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
  description: '查询 NovelAI 账户的 Anlas 点数余额。无需参数。',
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

      const actualPrompt = args.base_prompt || args.prompt || args.input;
      if (!actualPrompt) throw new Error('Missing base_prompt');

      // Characters
      let charArray = [];
      if (Array.isArray(args.characters)) {
        charArray = args.characters;
      } else if (args.characters && typeof args.characters === 'object') {
        charArray = [args.characters];
      }
      const characterPrompts: CharacterPrompt[] = charArray.map((char: any) => ({
        prompt: char.prompt,
        uc: char.negative_prompt || "",
        center: { x: char.center_x ?? 0.5, y: char.center_y ?? 0.5 },
        enabled: true,
      }));

      // Determine action
      const hasImg2Img = !!args.image;
      const action = hasImg2Img ? 'img2img' : 'generate';

      // Base parameters
      const apiParams: ImageGenerationParams = {
        prompt: actualPrompt,
        negative_prompt: args.base_negative_prompt || "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry",
        characterPrompts,
        model: 'nai-diffusion-4-5-full',
        action,
        width: args.width || 832,
        height: args.height || 1216,
        steps: args.steps ?? 28,
        seed: args.seed ?? Math.floor(Math.random() * 4294967295),
        scale: args.scale ?? 6,
        sampler: args.sampler || 'k_euler_ancestral',
        n_samples: Math.min(args.n_samples ?? 1, 8),
        noise_schedule: args.noise_schedule || 'karras',
        qualityToggle: args.quality_toggle ?? true,
        ucPreset: args.uc_preset ?? 0,
        autoSmea: args.auto_smea ?? false,
        cfg_rescale: args.cfg_rescale ?? 0,
        image_format: args.image_format || 'png',
        skip_cfg_above_sigma: 58,
        prefer_brownian: true,
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
        const mode = args.reference_mode || 'character_style';
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
        console.error(`🔧 Inpainting mode`);
      }

      // Log key params
      console.error(`🎨 Generating... seed=${apiParams.seed} cfg=${apiParams.scale} steps=${apiParams.steps} sampler=${apiParams.sampler} ${apiParams.precise_references ? 'precise-ref-via-proxy' : hasImg2Img ? 'img2img' : 'txt2img'}`);

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
      const saveDir = process.env.NOVELAI_SAVE_DIR;
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
      const balance = await client.checkAnlasBalance();
      return {
        content: [{ type: 'text', text: `Anlas 余额: ${balance.toLocaleString()}` }],
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
