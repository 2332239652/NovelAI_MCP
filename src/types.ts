/**
 * NovelAI API Types and Interfaces
 * Supporting latest models including NAI Diffusion V5 Full / Curated
 */

// Supported image generation models
// 注意：不存在 nai-diffusion-5-curated-inpainting —— 官方 UI 将 V5 Curated 的局部重绘
// 路由到 nai-diffusion-4-5-curated-inpainting（该模式最多 6 个角色）。
export type Model =
  | 'nai-diffusion-4-5-full'
  | 'nai-diffusion-4-5-curated'
  | 'nai-diffusion-5-full'
  | 'nai-diffusion-5-curated'
  | 'nai-diffusion-5-full-inpainting'
  | 'nai-diffusion-4-5-full-inpainting'
  | 'nai-diffusion-4-5-curated-inpainting';

export type Action = 'generate' | 'img2img' | 'infill';

export type Sampler =
  | 'k_euler'
  | 'k_euler_ancestral'
  | 'k_dpmpp_2s_ancestral'
  | 'k_dpmpp_2m'
  | 'k_dpmpp_sde'
  | 'ddim_v3'
  | 'ddim';

export type NoiseSchedule =
  | 'native'
  | 'karras'
  | 'exponential'
  | 'polyexponential';

export interface PreciseReference {
  image: string;            // Base64 encoded reference image
  mode: 'character_style' | 'character' | 'style';
  strength: number;         // 0-1
  fidelity: number;         // 0-1
  enabled: boolean;
}

export type ImageFormat = 'png' | 'jpg' | 'webp';
export type StreamType = 'msgpack';

// V4+ Character/Prompt structures
export interface CharacterCenter {
  x: number; // 0-1, normalized coordinates
  y: number; // 0-1, normalized coordinates
}

export interface CharacterCaption {
  char_caption: string;
  centers: CharacterCenter[];
}

export interface PromptCaption {
  base_caption: string;
  char_captions: CharacterCaption[];
}

export interface V4Prompt {
  caption: PromptCaption;
  use_coords: boolean;
  use_order: boolean;
}

export interface V4NegativePrompt {
  caption: PromptCaption;
  legacy_uc: boolean;
}

export interface CharacterPrompt {
  prompt: string;
  uc: string; // negative prompt for this character
  center: CharacterCenter;
  enabled: boolean;
  /** AI's Choice：true = 忽略坐标，由模型自由排布（use_coords=false 贡献者） */
  aic?: boolean;
}

// User-facing simplified parameters
export interface ImageGenerationParams {
  // Required
  prompt: string;

  // Model selection
  model?: Model;
  action?: Action;

  // Basic parameters
  negative_prompt?: string;
  width?: number;  // 64-1536, must be multiple of 64
  height?: number; // 64-1536, must be multiple of 64

  // Sampling parameters
  steps?: number;           // 1-50
  scale?: number;           // CFG scale: 0-10
  sampler?: Sampler;
  seed?: number;            // Random seed
  n_samples?: number;       // Number of images: 1-8

  // Advanced parameters
  uncond_scale?: number;    // Negative prompt strength: 0-1.5
  noise_schedule?: NoiseSchedule;
  sm?: boolean;             // SMEA (ignored if autoSmea is true)
  sm_dyn?: boolean;         // SMEA DYN (ignored if autoSmea is true)
  autoSmea?: boolean;       // Auto SMEA (V4.5+)
  dynamic_thresholding?: boolean;
  cfg_rescale?: number;     // 0-1

  // V3+ specific
  qualityToggle?: boolean;  // Enable quality tags
  ucPreset?: number;        // Negative prompt preset: 0-3

  // V4.5+ specific
  skip_cfg_above_sigma?: number | null;  // Variety+：58=开，null/undefined=关（官方默认关）
  prefer_brownian?: boolean;      // Default: true for V4.5（仅 k_euler_ancestral 时发送）
  image_format?: ImageFormat;     // Output format

  // V5 specific
  /** 透明背景：true 时追加官方透明标签并设置 straight_alpha + tag_hint_transparent_background */
  transparent_background?: boolean;
  /** 透明 alpha 模式：true=Straight（默认），false=Premultiplied；仅 transparent_background=true 时生效 */
  straight_alpha?: boolean;

  // Multi-character support (V4+)
  characterPrompts?: CharacterPrompt[];

  // Image-to-image specific
  image?: string;           // Base64 encoded image
  strength?: number;        // Denoising strength: 0-0.99
  noise?: number;           // Added noise: 0-0.99

  // Inpainting specific
  mask?: string;            // Base64 encoded mask
  add_original_image?: boolean;
  inpaintImg2ImgStrength?: number;

  // Control
  controlnet_condition?: string;  // Base64 encoded control image
  controlnet_model?: string;
  controlnet_strength?: number;   // 0-2

  // VibeTransfer
  reference_image_multiple?: string[];
  reference_strength_multiple?: number[];
  reference_information_extracted_multiple?: number[];
  reference_strength?: number;
  normalize_reference_strength_multiple?: boolean;

  // Precise Reference
  precise_references?: PreciseReference[];
}

// Internal API request structure for V4+
export interface NovelAIRequestPayload {
  input: string;
  model: string;
  action: Action;
  parameters: {
    params_version: number;
    width: number;
    height: number;
    scale: number;
    sampler: Sampler;
    steps: number;
    n_samples: number;
    ucPreset: number;
    qualityToggle: boolean;
    autoSmea: boolean;
    dynamic_thresholding: boolean;
    controlnet_strength: number;
    legacy: boolean;
    add_original_image: boolean;
    cfg_rescale: number;
    noise_schedule: NoiseSchedule;
    legacy_v3_extend: boolean;
    skip_cfg_above_sigma: number;
    use_coords: boolean;
    normalize_reference_strength_multiple: boolean;
    inpaintImg2ImgStrength: number;
    v4_prompt?: V4Prompt;
    v4_negative_prompt?: V4NegativePrompt;
    legacy_uc: boolean;
    seed: number;
    characterPrompts: CharacterPrompt[];
    negative_prompt: string;
    deliberate_euler_ancestral_bug: boolean;
    prefer_brownian: boolean;
    image_format: ImageFormat;
    stream: StreamType;
    [key: string]: any; // For additional dynamic parameters
  };
}

export interface ImageGenerationResponse {
  event: string;
  data: string; // Base64 encoded image(s) in ZIP format
}

export interface NovelAIError {
  statusCode: number;
  message: string;
}
