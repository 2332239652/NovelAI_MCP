import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { 
  ImageGenerationParams, 
  CharacterPrompt,
  V4Prompt,
  V4NegativePrompt
} from './types.js';

export class NovelAIClient {
  private apiKey: string;
  private baseUrl: string;
  private proxyUrl: string;
  private agent: any;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('NovelAI API key is required');
    }
    this.apiKey = apiKey;
    this.baseUrl = 'https://image.novelai.net';
    this.proxyUrl = 'https://api.mmw.ink/nai';

    const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (proxy) {
      this.agent = new HttpsProxyAgent(proxy);
      console.error('🔌 Using proxy:', proxy);
    }
  }

  /**
   * 构建 V4 Prompt 结构
   */
  private buildV4Prompt(prompt: string, characterPrompts: CharacterPrompt[] = []): V4Prompt {
    return {
      caption: {
        base_caption: prompt,
        char_captions: characterPrompts.map(char => ({
          char_caption: char.prompt,
          centers: [char.center],
        })),
      },
      use_coords: characterPrompts.length > 0,
      use_order: true,
    };
  }

  /**
   * 构建 V4 Negative Prompt 结构
   */
  private buildV4NegativePrompt(negativePrompt: string, characterPrompts: CharacterPrompt[] = []): V4NegativePrompt {
    return {
      caption: {
        base_caption: negativePrompt,
        char_captions: characterPrompts.map(char => ({
          char_caption: char.uc,
          centers: [char.center],
        })),
      },
      legacy_uc: false,
    };
  }

  /**
   * 生成图片
   */
  async generateImage(params: ImageGenerationParams): Promise<Buffer> {
    const {
      prompt,
      model = 'nai-diffusion-4-5-full',
      action = 'generate',
      negative_prompt = '',
      width = 832,
      height = 1216,
      steps = 28,
      scale = 6,
      sampler = 'k_euler_ancestral',
      seed,
      n_samples = 1,
      noise_schedule = 'karras',
      sm = false,
      sm_dyn = false,
      autoSmea = false,
      dynamic_thresholding = false,
      cfg_rescale = 0,
      qualityToggle = true,
      ucPreset = 0,
      skip_cfg_above_sigma = 58,
      prefer_brownian = true,
      image_format = 'png',
      characterPrompts = [],
      add_original_image = true,
      inpaintImg2ImgStrength = 1,
      controlnet_strength = 1,
      normalize_reference_strength_multiple = true,
      reference_image_multiple,
      reference_strength_multiple,
      reference_information_extracted_multiple,
      precise_references,
      image,
      strength,
      noise,
      mask,
      ...rest
    } = params;

    if (!prompt) throw new Error('Prompt is required');

    const generatedSeed = seed ?? Math.floor(Math.random() * 4294967295);

    // 使用 any 来构建 payload，避免复杂的 TypeScript 嵌套类型检查
    // 因为 parameters 里的字段非常多且部分是动态的
    const payload: any = {
      input: prompt,
      model,
      action,
      parameters: {
        params_version: 3,
        width,
        height,
        scale,
        sampler,
        steps,
        n_samples,
        ucPreset,
        qualityToggle,
        autoSmea,
        dynamic_thresholding,
        controlnet_strength,
        legacy: false,
        add_original_image,
        cfg_rescale,
        noise_schedule,
        legacy_v3_extend: false,
        seed: generatedSeed,
        negative_prompt,
        legacy_uc: false,
        deliberate_euler_ancestral_bug: false,
        prefer_brownian,
        image_format,
        // ❌ 删除 stream 参数，强制使用 ZIP
        skip_cfg_above_sigma,
        use_coords: characterPrompts.length > 0,
        normalize_reference_strength_multiple,
        inpaintImg2ImgStrength,
        characterPrompts: characterPrompts.map(char => ({
          prompt: char.prompt,
          uc: char.uc,
          center: char.center,
          enabled: char.enabled ?? true,
        })),
        v4_prompt: this.buildV4Prompt(prompt, characterPrompts),
        v4_negative_prompt: this.buildV4NegativePrompt(negative_prompt, characterPrompts),
      },
    };

    // 手动处理 SMEA 参数
    if (!autoSmea) {
      payload.parameters.sm = sm;
      payload.parameters.sm_dyn = sm_dyn;
    }

    // 合并剩余参数
    Object.assign(payload.parameters, rest);

    // Vibe Transfer + Precise Reference 放入 parameters 内部
    if (reference_image_multiple) {
      payload.parameters.reference_image_multiple = reference_image_multiple;
      payload.parameters.reference_strength_multiple = reference_strength_multiple;
      payload.parameters.reference_information_extracted_multiple = reference_information_extracted_multiple;
      payload.parameters.normalize_reference_strength_multiple = normalize_reference_strength_multiple;
    }
    if (precise_references) {
      payload.parameters.precise_references = precise_references;
    }
    // img2img
    if (image) {
      payload.parameters.image = image;
      if (strength !== undefined) payload.parameters.strength = strength;
      if (noise !== undefined) payload.parameters.noise = noise;
    }
    if (mask) {
      payload.parameters.mask = mask;
    }

    // Debug: log payload structure (omit large base64 fields)
    const hasRefImg = !!payload.reference_image_multiple;
    const hasImg = !!payload.image;
    console.error('📤 Payload:', JSON.stringify({ 
      input: payload.input, model: payload.model, action: payload.action, 
      paramKeys: Object.keys(payload.parameters).filter(k => k !== 'characterPrompts' && k !== 'v4_prompt' && k !== 'v4_negative_prompt'),
      hasRefImg: hasRefImg ? payload.reference_image_multiple.length : 0, 
      refStrength: payload.reference_strength, 
      hasImg: hasImg 
    }));

    try {
      console.error(`🚀 Requesting NovelAI (ZIP Mode)... Seed: ${generatedSeed}`);
      
      const fetchOptions: any = {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Origin': 'https://novelai.net',
          'Referer': 'https://novelai.net/',
        },
        body: JSON.stringify(payload),
      };

      if (this.agent) {
        fetchOptions.agent = this.agent;
      }

      const response = await fetch(`${this.baseUrl}/ai/generate-image`, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`NovelAI API Error (${response.status}): ${errorText}`);
      }

      const buffer = await response.arrayBuffer();
      return Buffer.from(buffer);

    } catch (error) {
      console.error('💥 Client Error:', error);
      throw error;
    }
  }

  /**
   * 查询 Anlas 点数余额
   */
  async checkAnlasBalance(): Promise<number> {
    try {
      const fetchOptions: any = {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Origin': 'https://novelai.net',
          'Referer': 'https://novelai.net/',
        },
      };
      if (this.agent) fetchOptions.agent = this.agent;

      const response = await fetch(`${this.proxyUrl}/v1/anlas`, fetchOptions);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: any = await response.json();
      const anlas = Number(data.anlas);
      if (!Number.isFinite(anlas) || anlas <= 0) throw new Error('Invalid anlas value');
      return anlas;
    } catch (error) {
      console.error('💥 Anlas Check Error:', error);
      throw error;
    }
  }

  /**
   * 通过镜像站 API 生成图片，支持 precise_references
   */
  async generateImageViaProxy(params: ImageGenerationParams): Promise<Buffer> {
    const {
      prompt, model = 'nai-diffusion-4-5-full', negative_prompt = '',
      width = 832, height = 1216, steps = 28, scale = 5,
      sampler = 'k_euler_ancestral', seed,
      n_samples = 1, noise_schedule = 'karras',
      qualityToggle = true, ucPreset = 0, cfg_rescale = 0,
      image_format = 'png',
      precise_references,
      characterPrompts = [],
    } = params;

    const generatedSeed = seed ?? Math.floor(Math.random() * 4294967295);

    const nai: any = {
      n_samples, steps, scale, sampler, noise_schedule,
      ucPreset, qualityToggle, cfg_rescale,
      seed: generatedSeed,
      negative_prompt,
    };

    if (precise_references) {
      nai.precise_references = precise_references;
    }

    const [w, h] = [width, height];
    const sizeStr = `${w}x${h}`;

    const payload: any = {
      prompt,
      model,
      size: sizeStr,
      width: w,
      height: h,
      negative_prompt,
      sampler,
      steps,
      scale,
      seed: generatedSeed,
      response_format: 'b64_json',
      nai,
    };

    if (characterPrompts.length > 0) {
      nai.characters = characterPrompts.map((char: any) => ({
        prompt: char.prompt,
        uc: char.uc || '',
        center: char.center,
        enabled: true,
      }));
      nai.use_coords = characterPrompts.length > 0;
      nai.use_order = true;
    }

    try {
      console.error(`🚀 Requesting via Proxy (Precise Ref Mode)... Seed: ${generatedSeed}`);

      const fetchOptions: any = {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      };
      if (this.agent) fetchOptions.agent = this.agent;

      const response = await fetch(`${this.proxyUrl}/v1/images/generations`, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Proxy API Error (${response.status}): ${errorText}`);
      }

      const data: any = await response.json();
      const images = Array.isArray(data.data) ? data.data : [];
      if (!images.length || !images[0].b64_json) {
        throw new Error('No image in proxy response');
      }
      const buffer = Buffer.from(images[0].b64_json, 'base64');
      // 验证是有效的 PNG
      if (buffer[0] !== 0x89 || buffer[1] !== 0x50) {
        throw new Error('Proxy returned invalid image format');
      }
      return buffer;
    } catch (error) {
      console.error('💥 Proxy Client Error:', error);
      throw error;
    }
  }
}