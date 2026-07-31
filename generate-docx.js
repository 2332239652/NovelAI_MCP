#!/usr/bin/env node
/**
 * 生成 NovelAI MCP 配置教程 DOCX
 */
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, PageBreak, InternalHyperlink, ShadingType, LevelFormat, NumberFormat, TabStopPosition, TabStopType } from 'docx';
import fs from 'fs';
import path from 'path';

// ========== 样式常量 ==========
const COLORS = {
  primary: '1a73e8',
  secondary: '5f6368',
  success: '0d904f',
  warning: 'e37400',
  error: 'd93025',
  bgLight: 'f8f9fa',
  bgCode: 'f4f4f4',
  border: 'dadce0',
  heading1: '1a73e8',
  heading2: '3c4043',
  heading3: '5f6368',
};

const FONTS = {
  title: 'Microsoft YaHei',
  heading: 'Microsoft YaHei',
  body: 'Microsoft YaHei',
  code: 'Consolas',
};

// ========== 辅助函数 ==========

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    children: [
      new TextRun({ text, font: FONTS.heading, size: 32, bold: true, color: COLORS.heading1 }),
    ],
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160 },
    children: [
      new TextRun({ text, font: FONTS.heading, size: 26, bold: true, color: COLORS.heading2 }),
    ],
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 120 },
    children: [
      new TextRun({ text, font: FONTS.heading, size: 22, bold: true, color: COLORS.heading3 }),
    ],
  });
}

function para(text, opts = {}) {
  const runOpts = { font: FONTS.body, size: 21 };
  if (opts.bold) runOpts.bold = true;
  if (opts.color) runOpts.color = opts.color;
  if (opts.italic) runOpts.italics = true;
  if (opts.size) runOpts.size = opts.size;

  return new Paragraph({
    spacing: { after: opts.afterSpacing ?? 120, line: 360 },
    alignment: opts.alignment,
    indent: opts.indent,
    children: [new TextRun(runOpts)],
  });
}

function codeBlock(code) {
  const lines = code.split('\n');
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    indent: { left: 400 },
    shading: { type: ShadingType.CLEAR, fill: COLORS.bgCode },
    border: {
      left: { style: BorderStyle.SINGLE, size: 6, color: COLORS.border, space: 8 },
    },
    children: lines.map((line, i) =>
      new TextRun({
        text: i < lines.length - 1 ? line + '\n' : line,
        font: FONTS.code,
        size: 18,
        color: '3c4043',
      })
    ),
  });
}

function inlineCode(text) {
  return new TextRun({ text, font: FONTS.code, size: 20, color: 'e37400', bold: true });
}

function bullet(text, level = 0) {
  return new Paragraph({
    spacing: { after: 60, line: 340 },
    indent: { left: level * 400 + 600, hanging: 200 },
    children: [
      new TextRun({ text: `• ${text}`, font: FONTS.body, size: 21 }),
    ],
  });
}

function note(text, type = 'info') {
  const iconMap = { info: '💡', success: '✅', warning: '⚠️', error: '❌', tip: '📌' };
  const colorMap = { info: COLORS.primary, success: COLORS.success, warning: COLORS.warning, error: COLORS.error, tip: COLORS.secondary };
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    indent: { left: 200 },
    shading: { type: ShadingType.CLEAR, fill: COLORS.bgLight },
    border: {
      left: { style: BorderStyle.SINGLE, size: 6, color: colorMap[type], space: 8 },
    },
    children: [
      new TextRun({ text: `${iconMap[type]} `, font: FONTS.body, size: 21 }),
      new TextRun({ text, font: FONTS.body, size: 21, color: colorMap[type] }),
    ],
  });
}

function emptyLine() {
  return new Paragraph({ spacing: { after: 60 }, children: [] });
}

function tableRow(cells, header = false) {
  return new TableRow({
    tableHeader: header,
    children: cells.map((cell, i) =>
      new TableCell({
        width: { size: i === 0 ? 30 : 70, type: WidthType.PERCENTAGE },
        shading: header ? { type: ShadingType.CLEAR, fill: COLORS.primary } : undefined,
        children: [
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: cell,
                font: FONTS.body,
                size: 20,
                bold: header,
                color: header ? 'ffffff' : '3c4043',
              }),
            ],
          }),
        ],
      })
    ),
  });
}

function makeTable(headers, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      tableRow(headers, true),
      ...rows.map(r => tableRow(r)),
    ],
  });
}

function numberedStep(number, text) {
  return new Paragraph({
    spacing: { after: 80, line: 340 },
    indent: { left: 400, hanging: 240 },
    children: [
      new TextRun({ text: `${number}. `, font: FONTS.body, size: 22, bold: true, color: COLORS.primary }),
      new TextRun({ text, font: FONTS.body, size: 21 }),
    ],
  });
}

// ========== 文档内容 ==========

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: FONTS.body, size: 21, color: '3c4043' },
        paragraph: { spacing: { line: 360 } },
      },
    },
  },
  sections: [
    // ========== 封面页 ==========
    {
      children: [
        emptyLine(), emptyLine(), emptyLine(), emptyLine(), emptyLine(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({ text: '🎨', font: FONTS.body, size: 80 }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [
            new TextRun({ text: 'NovelAI MCP 配置教程', font: FONTS.heading, size: 52, bold: true, color: COLORS.heading1 }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 40 },
          children: [
            new TextRun({ text: '从零开始在 Cherry Studio 中集成 NovelAI 生图能力', font: FONTS.body, size: 24, color: COLORS.secondary }),
          ],
        }),
        emptyLine(), emptyLine(), emptyLine(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [
            new TextRun({ text: '本文档基于实际配置过程整理而成', font: FONTS.body, size: 22, color: COLORS.secondary, italics: true }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [
            new TextRun({ text: '包含安装步骤、环境变量配置、常见问题排查', font: FONTS.body, size: 22, color: COLORS.secondary }),
          ],
        }),
        emptyLine(), emptyLine(), emptyLine(), emptyLine(), emptyLine(), emptyLine(), emptyLine(), emptyLine(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `生成日期：${new Date().toLocaleDateString('zh-CN')}`, font: FONTS.body, size: 20, color: COLORS.secondary }),
          ],
        }),
      ],
    },

    // ========== 目录页 ==========
    {
      children: [
        heading1('目录'),
        para('一、概述', { bold: true, afterSpacing: 80 }),
        para('二、前置准备', { bold: true, afterSpacing: 80 }),
        para('三、安装步骤详解', { bold: true, afterSpacing: 80 }),
        para('四、Cherry Studio 配置', { bold: true, afterSpacing: 80 }),
        para('五、环境变量配置', { bold: true, afterSpacing: 80 }),
        para('六、Agent 绑定', { bold: true, afterSpacing: 80 }),
        para('七、使用示例', { bold: true, afterSpacing: 80 }),
        para('八、进阶技巧', { bold: true, afterSpacing: 80 }),
        para('九、常见问题排查', { bold: true, afterSpacing: 80 }),
        para('十、结语', { bold: true, afterSpacing: 80 }),
      ],
    },

    // ========== 正文 ==========
    {
      children: [
        // ===== 一、概述 =====
        heading1('一、概述'),
        para('NovelAI 是一款专注于二次元、漫画、轻小说风格的 AI 绘画平台。它的核心模型 "NAI Diffusion V4.5 Full" 能够生成高质量的动漫风格图像。'),
        para('然而，NovelAI 使用 Danbooru 标签体系来编写提示词，门槛较高——需要了解大量英文标签的含义和组合方式。'),
        para('本教程通过 MCP (Model Context Protocol) 将 NovelAI 集成到 Cherry Studio 中，让你可以用自然语言描述需求，AI 助手自动帮你转换成 NovelAI 能理解的提示词并生成图片。'),
        note('最终效果：你只需要说「画一个蓝发动漫女孩，微笑，校园背景」，AI 就会自动生成对应的图片。', 'success'),

        // ===== 二、前置准备 =====
        heading1('二、前置准备'),
        heading2('2.1 硬件要求'),
        bullet('一台能正常运行的 Windows 电脑'),
        bullet('稳定的网络连接（访问 NovelAI 需要科学上网）'),
        bullet('至少 500MB 可用磁盘空间'),

        heading2('2.2 软件要求'),
        bullet('Node.js 18+（必须）'),
        bullet('Cherry Studio 最新版（必须）'),
        bullet('Git（可选，但推荐）'),
        bullet('Clash Verge 或类似代理工具（用于访问 NovelAI API）'),

        note('安装 Node.js 请访问 https://nodejs.org ，下载 LTS 版本安装即可。', 'tip'),

        // ===== 三、安装步骤 =====
        heading1('三、安装步骤详解'),
        para('以下是完整的安装流程，每一步都配有说明。'),

        heading2('3.1 克隆项目'),
        numberedStep(1, '打开命令行（Win+R → 输入 cmd → 回车）'),
        numberedStep(2, '进入桌面目录：'),
        codeBlock('cd /d %USERPROFILE%\\Desktop'),
        numberedStep(3, '克隆项目：'),
        codeBlock('git clone https://github.com/fishslot/NovelAI_MCP.git'),
        para('如果提示 "git 不是内部或外部命令"，可以跳过这一步，直接下载 ZIP 压缩包解压到桌面，文件夹名改为 NovelAI_MCP。'),

        emptyLine(),
        heading2('3.2 安装依赖'),
        numberedStep(1, '进入项目目录：'),
        codeBlock('cd /d %USERPROFILE%\\Desktop\\NovelAI_MCP'),
        numberedStep(2, '安装 npm 依赖：'),
        codeBlock('npm install'),
        para('这一步会自动下载所有依赖包，包括 @modelcontextprotocol/sdk、adm-zip、node-fetch 等。看到 "found 0 vulnerabilities" 即表示成功。'),

        emptyLine(),
        heading2('3.3 编译项目'),
        numberedStep(1, '执行构建：'),
        codeBlock('npm run build'),
        para('这会生成 dist/index.js 文件。如果 dist 目录下已有 index.js 且源码没有更新，也可以跳过编译直接使用。'),

        emptyLine(),
        heading2('3.4 创建启动脚本（重要！）'),
        para('由于 Cherry Studio 启动 MCP 时的工作目录（CWD）问题，直接运行 node 可能会导致 ESM 模块加载失败。解决方法：创建批处理文件。'),
        numberedStep(1, '在 NovelAI_MCP 文件夹中新建文本文档，改名为 start_novelai.bat'),
        numberedStep(2, '右键编辑，输入以下内容：'),
        codeBlock('@echo off\ncd /d "C:\\Users\\你的用户名\\Desktop\\NovelAI_MCP"\nnode dist/index.js'),
        numberedStep(3, '保存文件。注意将路径中的 "你的用户名" 替换为实际的 Windows 用户名。'),
        note('这个批处理文件的作用是先切换到正确的目录，再启动 Node.js，避免 CWD 问题。', 'warning'),

        // ===== 四、Cherry Studio 配置 =====
        heading1('四、Cherry Studio 配置'),

        heading2('4.1 打开 MCP 设置'),
        numberedStep(1, '打开 Cherry Studio'),
        numberedStep(2, '点击左下角「设置」图标'),
        numberedStep(3, '在设置页面中找到「MCP 服务」或「MCP 设置」'),

        emptyLine(),
        heading2('4.2 添加 MCP 客户端'),
        para('在 MCP 设置中，填写的参数如下：'),
        makeTable(
          ['参数', '值'],
          [
            ['名称', 'novelai-mcp'],
            ['类型', 'stdio'],
            ['命令', 'cmd.exe'],
            ['参数', ['/c', 'cd /d "C:\\Users\\你的用户名\\Desktop\\NovelAI_MCP" && node dist/index.js'].join(' ')],
          ]
        ),
        emptyLine(),
        para('关键点说明：'),
        bullet('使用 cmd.exe 而不是直接使用 node，因为 cmd 可以执行 cd 命令先切换目录'),
        bullet('使用 && 连接命令，确保先 cd 再 node'),
        bullet('路径要使用绝对路径，不要用相对路径'),

        emptyLine(),
        heading2('4.3 配置环境变量'),
        para('在 MCP 设置的环境变量（Env）部分，添加以下变量：'),
        makeTable(
          ['变量名', '变量值', '说明'],
          [
            ['NOVELAI_API_KEY', 'pst-xxxxxxxxxxxxxxxxxxxxxxxx', '你的 NovelAI API Key（必填）'],
            ['HTTPS_PROXY', 'http://127.0.0.1:7897', '代理地址（国内网络必填）'],
            ['NOVELAI_SAVE_DIR', 'C:\\Users\\你的用户名\\Desktop\\NovelAI_Output', '图片自动保存路径（可选）'],
          ]
        ),
        emptyLine(),

        heading3('获取 API Key'),
        numberedStep(1, '访问 https://novelai.net/settings 并登录'),
        numberedStep(2, '找到 "Account" → "Persistence Tokens" 或 "API Keys"'),
        numberedStep(3, '点击 "+" 或 "Create Token"，选择 "Generated Images" 权限'),
        numberedStep(4, '复制以 pst- 开头的 key，保存好（关闭后不会再次显示）'),
        note('API Key 请妥善保管，不要分享给他人！如果怀疑泄露，可以在 NovelAI 网站重置。', 'error'),

        emptyLine(),
        heading3('代理配置'),
        para('NovelAI 的 API 服务器在国外（api.novelai.net），国内直连可能会超时。需要配置代理：'),
        bullet('如果你使用 Clash Verge：打开软件，在设置中查看「系统代理」地址'),
        bullet('通常是 http://127.0.0.1:7897 或 http://127.0.0.1:7890'),
        bullet('在 MCP 环境变量中填入 HTTPS_PROXY=http://127.0.0.1:7897'),
        note('如果代理设置错误，会出现 "request to https://image.novelai.net/ai/generate-image failed" 的错误。', 'warning'),

        // ===== 五、保存配置并启用 =====
        heading1('五、保存配置并启用'),

        heading2('5.1 保存并测试连接'),
        numberedStep(1, '填写完所有配置后，点击「保存」'),
        numberedStep(2, '在 MCP 服务列表中，找到 novelai-mcp，确认状态为「已连接」'),
        numberedStep(3, '如果显示「已连接」，说明配置成功'),

        emptyLine(),
        heading2('5.2 检查 MCP 工具列表'),
        numberedStep(1, '在 Cherry Studio 主界面，新建一个对话'),
        numberedStep(2, '点击输入框上方的「工具」按钮（扳手图标）'),
        numberedStep(3, '如果看到 novelai-mcp 出现，且可以看到 generate_image 工具，说明集成成功'),
        note('如果没有出现，尝试重启 Cherry Studio。', 'tip'),

        // ===== 六、Agent 绑定 =====
        heading1('六、Agent 绑定'),
        para('为了让 AI 助手能使用 NovelAI 生图功能，需要在 Agent 中绑定 MCP 工具。'),

        heading2('6.1 创建/编辑 Agent'),
        numberedStep(1, '在 Cherry Studio 左侧导航栏点击「助手」或「Agent」'),
        numberedStep(2, '创建新 Agent 或编辑已有的（如「NovelAI Assistant」）'),
        numberedStep(3, '在 Agent 编辑页面中，找到「MCP 服务」选项'),
        numberedStep(4, '勾选 novelai-mcp'),

        emptyLine(),
        heading2('6.2 编写 Agent 提示词'),
        para('为了让 AI 更好地编写 NovelAI 提示词，建议在 Agent 的系统提示词中加入以下内容：'),
        codeBlock(`你是 NovelAI 生图助手，擅长将用户的中文描述转换为 NovelAI 可理解的 Danbooru 标签格式。

## 核心规则
1. 所有提示词使用英文 Danbooru 标签，用逗号分隔
2. 标签顺序：画风/质量 > 角色 > 外貌 > 服装 > 姿势 > 背景 > 光照 > 氛围
3. 质量词前置：masterpiece, best quality
4. NSFW 内容使用 rating:explicit / rating:questionable

## 使用流程
当用户描述想生成的图片时：
1. 理解用户需求，拆解为 Danbooru 标签
2. 调用 generate_image 工具生成图片
3. 生成后将图片展示给用户

## 示例
用户：一个穿白色连衣裙的蓝发少女，站在樱花树下
→ prompt: masterpiece, best quality, 1girl, solo, blue hair, long hair, white dress, standing, cherry blossoms, tree, spring, sunlight, detailed background`),
        note('以上提示词可以根据需要自由修改和扩充。', 'tip'),

        heading2('6.3 切换对话'),
        para('配置完成后，在 Cherry Studio 左上角的助手下拉菜单中，选择刚配置好的 Agent。之后所有对话都会使用这个助手。'),
        note('注意：普通助手可能不了解 NovelAI 提示词规则。使用配置好的 Agent 才能获得最佳生图体验。', 'warning'),

        // ===== 七、使用示例 =====
        heading1('七、使用示例'),
        para('以下是一个完整的生图示例流程：'),

        heading2('7.1 示例描述'),
        para('用户输入（中文口语化描述）：'),
        codeBlock('一个身高148左右的少女，开朗地笑，淡蓝色长发，M字刘海，身穿白色为主掺杂黑色和金丝的修女服，头纱上绑着小蝴蝶结，白丝袜，小皮鞋，短裙，笑着招手，空白背景。'),

        heading2('7.2 AI 转换后的提示词'),
        para('助手会将其转换为：'),
        codeBlock(`prompt: masterpiece, best quality, 1girl, solo, smile, open mouth, happy, blue hair, long hair, m shaped bangs, hair ornament, ribbon, nun habit, black trim, gold trim, short sleeves, short skirt, white stockings, Mary Janes, waving, plain background, simple background, looking at viewer

negative_prompt: lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry`),

        heading2('7.3 参数建议'),
        para('对于人物肖像类图片，推荐以下参数：'),
        makeTable(
          ['参数', '推荐值', '说明'],
          [
            ['width', '832', '竖版肖像的常用宽度'],
            ['height', '1216', '竖版肖像的常用高度'],
            ['steps', '28', '采样步数，28 是免费上限'],
            ['scale', '6', '提示词相关性，范围 4-12'],
            ['sampler', 'k_euler_ancestral', '常用采样器，细节丰富'],
          ]
        ),

        heading2('7.4 保存位置'),
        para('如果配置了 NOVELAI_SAVE_DIR 环境变量，生成的图片会自动保存到该目录，文件名为 novelai_YYYY-MM-DDTHH-MM-SS-XXXZ.png 格式。'),

        // ===== 八、进阶技巧 =====
        heading1('八、进阶技巧'),

        heading2('8.1 多人场景'),
        para('生成包含多个角色的图片：'),
        codeBlock(`characters: [
  { prompt: "1girl, blue hair, ...", center_x: 0.3 },
  { prompt: "1boy, black hair, ...", center_x: 0.7 }
]`),
        para('center_x 控制角色在画面中的水平位置，范围 0 (最左) 到 1 (最右)。双人场景推荐 0.3 和 0.7。'),

        heading2('8.2 画幅选择'),
        makeTable(
          ['场景', '宽×高', '比例'],
          [
            ['竖版/人物肖像', '832 × 1216', '~2:3'],
            ['横版/风景', '1216 × 832', '~3:2'],
            ['方形', '1024 × 1024', '1:1'],
            ['宽屏', '1408 × 832', '~17:10'],
          ]
        ),

        heading2('8.3 图生图'),
        para('你也可以将现有图片上传给 AI 助手，描述想要的修改（如改变画风、添加元素等），助手可以基于现有图片进行调整。'),

        // ===== 九、常见问题 =====
        heading1('九、常见问题排查'),

        heading2('9.1 "Connection closed" 错误'),
        para('MCP 连接关闭，通常由以下原因导致：'),
        bullet('启动脚本的 CWD（工作目录）不正确 → 使用 start_novelai.bat 或 cmd.exe /c cd 方式'),
        bullet('Node.js 版本过低 → 升级到 18+'),
        bullet('依赖未安装完成 → 重新执行 npm install'),

        heading2('9.2 "request to https://image.novelai.net/ai/generate-image failed"'),
        para('网络连接问题：'),
        bullet('确认代理工具（Clash Verge 等）已开启'),
        bullet('检查 HTTPS_PROXY 地址是否正确'),
        bullet('尝试在浏览器中访问 https://image.novelai.net 确认是否可达'),

        heading2('9.3 "401 Unauthorized" 或 "403 Forbidden"'),
        para('API Key 问题：'),
        bullet('检查 NOVELAI_API_KEY 是否正确设置'),
        bullet('确认 API Key 未过期'),
        bullet('登录 NovelAI 网站检查订阅状态'),

        heading2('9.4 MCP 工具列表中看不到 generate_image'),
        para('集成问题：'),
        bullet('重启 Cherry Studio'),
        bullet('检查 Agent 设置中是否勾选了 novelai-mcp'),
        bullet('检查 MCP 服务状态是否为「已连接」'),
        bullet('查看日志文件排查错误'),

        heading2('9.5 "npm install" 报错'),
        bullet('以管理员身份运行命令行'),
        bullet('检查 Node.js 版本：node --version'),
        bullet('删除 node_modules 文件夹后重试'),
        bullet('尝试设置 npm 镜像：npm config set registry https://registry.npmmirror.com'),

        // ===== 十、结语 =====
        heading1('十、结语'),
        para('通过以上配置，你已经成功将 NovelAI 的强大生图能力集成到了 Cherry Studio 中。从此，你只需要用中文描述你的想法，AI 助手就会帮你生成精美的二次元图片。'),
        emptyLine(),
        para('核心流程回顾：'),
        numberedStep(1, '安装 Node.js 和项目依赖'),
        numberedStep(2, '配置 Cherry Studio MCP 客户端'),
        numberedStep(3, '设置环境变量（API Key + 代理）'),
        numberedStep(4, '绑定 Agent 并开始使用'),
        emptyLine(),
        para('祝你生图愉快！🎉', { bold: true, size: 24, afterSpacing: 200 }),
      ],
    },
  ],
});

// ========== 生成文件 ==========
// 输出到当前工作目录，避免硬编码个人路径
const outputPath = path.join(process.cwd(), 'NovelAI_MCP_配置教程.docx');

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outputPath, buffer);
console.log(`✅ 文档已生成: ${outputPath}`);
