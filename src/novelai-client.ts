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
      // AI's Choice（网页端 AIC）语义：所有角色均为 AIC 时 use_coords=false，
      // 让模型自由排布；任一角色声明坐标时 use_coords=true。
      // 参考实现（nekoai handle_use_coords）：仅当存在非 AIC 角色时置 true。
      use_coords: characterPrompts.some(char => !char.aic),
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
      model = process.env.NOVELAI_MODEL || 'nai-diffusion-5-full',
      action = 'generate',
      negative_prompt = '',
      width = 832,
      height = 1216,
      steps,
      scale,
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
      skip_cfg_above_sigma,
      prefer_brownian = true,
      transparent_background,
      straight_alpha,
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

    // V5 默认走镜像站代理（镜像站已确认支持 V5）；可用 NOVELAI_USE_PROXY=false 强制走官方
    const useProxyByEnv = process.env.NOVELAI_USE_PROXY === 'true';
    const useProxyForV5 = model.startsWith('nai-diffusion-5-') && process.env.NOVELAI_USE_PROXY !== 'false';
    if (useProxyByEnv || useProxyForV5) {
      return this.generateImageViaProxy(params);
    }

    const generatedSeed = seed ?? Math.floor(Math.random() * 4294967295);
    const isV5 = model.startsWith('nai-diffusion-5-');
    const isV4Plus = isV5 || model.startsWith('nai-diffusion-4');
    // 官方推荐与社区共识：V5 Guidance≈5（区间 5-6）、Steps 20-28（20-23 最稳）；
    // V4.5 官方默认 CFG=6、Steps=28
    const finalSteps = steps ?? (isV5 ? 23 : 28);
    const finalScale = scale ?? (isV5 ? 5 : 6);
    // Variety+（skip_cfg_above_sigma）：官方默认关闭（不发送），开启时为 58
    const varietyValue = typeof skip_cfg_above_sigma === 'number' ? skip_cfg_above_sigma : undefined;
    // Euler Ancestral 标志位：仅在该采样器下发送（对齐官方抓包）
    const useEulerAncFlags = sampler === 'k_euler_ancestral';

    // 使用 any 来构建 payload，避免复杂的 TypeScript 嵌套类型检查
    // 因为 parameters 里的字段非常多且部分是动态的
    const payload: any = {
      input: prompt,
      model,
      action,
      parameters: {
        params_version: isV5 ? 4 : 3,
        width,
        height,
        scale: finalScale,
        sampler,
        steps: finalSteps,
        n_samples,
        ucPreset,
        qualityToggle,
        uncond_scale: 1,
        dynamic_thresholding,
        controlnet_strength,
        legacy: false,
        add_original_image,
        cfg_rescale,
        // V5 官方 UI 强制 karras 噪声调度（无选择器）
        noise_schedule: isV5 ? 'karras' : noise_schedule,
        legacy_v3_extend: false,
        seed: generatedSeed,
        negative_prompt,
        legacy_uc: false,
        image_format,
        use_coords: characterPrompts.some(c => !c.aic),
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

    // SMEA 仅 V3 及以下支持；V4/V4.5 按官方行为恒发 false，V5 不发送（发了可能 500）
    if (!isV4Plus) {
      payload.parameters.autoSmea = autoSmea;
      if (!autoSmea) {
        payload.parameters.sm = sm;
        payload.parameters.sm_dyn = sm_dyn;
      }
    } else if (!isV5) {
      payload.parameters.sm = false;
      payload.parameters.sm_dyn = false;
    }

    // 合并剩余参数
    Object.assign(payload.parameters, rest);

    // Euler Ancestral 标志位（对齐官方抓包：仅 k_euler_ancestral 时出现）
    if (useEulerAncFlags) {
      payload.parameters.deliberate_euler_ancestral_bug = false;
      payload.parameters.prefer_brownian = prefer_brownian;
    }
    // Variety+（skip_cfg_above_sigma）：仅在显式提供时发送（官方默认关闭）
    if (varietyValue !== undefined) {
      payload.parameters.skip_cfg_above_sigma = varietyValue;
    }
    // V5 透明背景：straight_alpha + tag_hint_transparent_background → RGBA PNG
    if (transparent_background) {
      payload.parameters.straight_alpha = straight_alpha ?? true;
      payload.parameters.tag_hint_transparent_background = true;
    }

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
      payload.parameters.extra_noise_seed = generatedSeed;
      payload.parameters.color_correct = false;
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
   * 查询账户信息（Anlas + V5 电量）。
   * 优先官方 https://image.novelai.net/user/subscription：
   *   - trainingStepsLeft.fixedTrainingStepsLeft + purchasedTrainingSteps = Anlas
   *   - usage.percent = V5 每周电量剩余百分比（Opus 专属，≈17.3 张/1%，满电约 1730 张）
   *   - usage.timeUntilNextPercent = 距下一 1% 恢复的秒数
   * 官方不可达时回退镜像站 /v1/anlas（仅 Anlas）。
   */
  async checkAccount(): Promise<{
    anlas: number;
    batteryPercent?: number;
    refillSecondsPerPercent?: number;
    source: 'official' | 'mirror';
  }> {
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

      const response = await fetch(`${this.baseUrl}/user/subscription`, fetchOptions);
      if (response.ok) {
        const data: any = await response.json();
        const fixed = Number(data?.trainingStepsLeft?.fixedTrainingStepsLeft ?? 0);
        const purchased = Number(data?.trainingStepsLeft?.purchasedTrainingSteps ?? 0);
        const anlas = fixed + purchased;
        const result: any = { anlas, source: 'official' as const };
        const usage = data?.usage;
        if (usage && typeof usage.percent === 'number') {
          result.batteryPercent = usage.percent;
          if (typeof usage.timeUntilNextPercent === 'number' && usage.timeUntilNextPercent > 0) {
            result.refillSecondsPerPercent = usage.timeUntilNextPercent;
          }
        }
        return result;
      }
      console.error(`⚠️ Official /user/subscription returned ${response.status}, falling back to mirror`);
    } catch (error) {
      console.error('⚠️ Official /user/subscription failed, falling back to mirror:', error);
    }

    // 镜像站回退
    const fetchOptions: any = {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    };
    if (this.agent) fetchOptions.agent = this.agent;

    const response = await fetch(`${this.proxyUrl}/v1/anlas`, fetchOptions);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data: any = await response.json();
    const anlas = Number(data.anlas);
    if (!Number.isFinite(anlas) || anlas < 0) throw new Error('Invalid anlas value');
    return { anlas, source: 'mirror' as const };
  }

  /**
   * 查询 Anlas 点数余额（兼容旧调用）
   */
  async checkAnlasBalance(): Promise<number> {
    const account = await this.checkAccount();
    return account.anlas;
  }

  /**
   * 通过镜像站 API 生成图片
   * 支持 txt2img、img2img、inpainting、多角色、Vibe Transfer、Precise Reference
   */
  async generateImageViaProxy(params: ImageGenerationParams): Promise<Buffer> {
    const {
      prompt, model = process.env.NOVELAI_MODEL || 'nai-diffusion-5-full', negative_prompt = '',
      width = 832, height = 1216, steps, scale,
      sampler = 'k_euler_ancestral', seed,
      n_samples = 1, noise_schedule = 'karras',
      qualityToggle = true, ucPreset = 0, cfg_rescale = 0,
      image_format = 'png',
      precise_references,
      characterPrompts = [],
      reference_image_multiple,
      reference_strength_multiple,
      reference_information_extracted_multiple,
      normalize_reference_strength_multiple = true,
      image,
      mask,
      strength,
      noise,
      add_original_image = true,
      inpaintImg2ImgStrength = 1,
    } = params;

    const generatedSeed = seed ?? Math.floor(Math.random() * 4294967295);
    const isV5 = model.startsWith('nai-diffusion-5-');
    // 与直连路径保持一致：V5 默认 CFG≈5 / Steps 23；V4.5 官方默认 CFG=6 / Steps=28
    const finalSteps = steps ?? (isV5 ? 23 : 28);
    const finalScale = scale ?? (isV5 ? 5 : 6);
    const useEulerAncFlags = sampler === 'k_euler_ancestral';

    const nai: any = {
      mode: 'anime',
      n_samples, steps: finalSteps, scale: finalScale, sampler,
      // V5 官方强制 karras
      noise_schedule: isV5 ? 'karras' : noise_schedule,
      ucPreset, qualityToggle, cfg_rescale,
      uncond_scale: 1,
      seed: generatedSeed,
      negative_prompt,
    };

    if (useEulerAncFlags) {
      nai.deliberate_euler_ancestral_bug = false;
      nai.prefer_brownian = true;
    }
    if (typeof params.skip_cfg_above_sigma === 'number') {
      nai.skip_cfg_above_sigma = params.skip_cfg_above_sigma;
    }
    if (params.transparent_background) {
      nai.straight_alpha = params.straight_alpha ?? true;
      nai.tag_hint_transparent_background = true;
    }

    if (precise_references) {
      nai.precise_references = precise_references;
    }

    if (reference_image_multiple) {
      nai.reference_image_multiple = reference_image_multiple;
      nai.reference_strength_multiple = reference_strength_multiple;
      nai.reference_information_extracted_multiple = reference_information_extracted_multiple;
      nai.normalize_reference_strength_multiple = normalize_reference_strength_multiple;
    }

    if (image) {
      nai.image = image;
      if (mask) {
        nai.action = 'infill';
        nai.mask = mask;
        nai.add_original_image = add_original_image;
        nai.inpaintImg2ImgStrength = inpaintImg2ImgStrength;
      } else {
        nai.action = 'img2img';
        nai.strength = strength ?? 0.6;
        nai.noise = noise ?? 0;
        nai.extra_noise_seed = generatedSeed;
        nai.color_correct = false;
      }
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
      steps: finalSteps,
      scale: finalScale,
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
      // AI's Choice：全部角色为 AIC 时 use_coords=false（模型自由排布）
      nai.use_coords = characterPrompts.some((c: any) => !c.aic);
      nai.use_order = true;
    }

    try {
      console.error(`🚀 Requesting via Proxy... Seed: ${generatedSeed}`);

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