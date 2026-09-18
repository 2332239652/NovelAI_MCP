# NovelAI MCP Server

> 📌 **This repository is a fork/derivative of [SGSxingchen/NovelAI_MCP](https://github.com/SGSxingchen/NovelAI_MCP)**, preserving the original author's full commit history. Thanks to the original author for their work.

> 💡 **Recommended pairing**: Use it with [novelai-assistant](https://github.com/2332239652/novelai-assistant) (a NovelAI prompt-engineering Skill for AI Agents) — the AI automatically translates natural-language descriptions into Danbooru-style prompts, then sends them to this MCP server for image generation.

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-20+-green.svg)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.0-purple.svg)](https://modelcontextprotocol.io/)

**A full-featured Model Context Protocol (MCP) server for NovelAI image generation API**

English | [简体中文](./README.md)

</div>

---

## ✨ Features

- 🎨 **Latest Model Support** - Support for NAI Diffusion V5 Full / V5 Curated, plus V4.5 Full / V4.5 Curated
- 🚀 **Dual Transport Modes** - Stdio (Claude Desktop) and HTTP SSE (LobeChat/Dify)
- 🎭 **Multi-Character Support** - V4+ character positioning with individual prompts
- ⚡ **Advanced Sampling** - 7 samplers, 4 noise schedules, Brownian noise
- 🎛️ **Full Parameter Control** - All NovelAI API parameters configurable
- 📝 **Optimized Descriptions** - Tool descriptions in Chinese for better AI recognition
- 🔧 **Flexible Deployment** - Local or Docker container
- 📚 **Comprehensive Docs** - Detailed examples and best practices

## 📦 Quick Start

### Installation

```bash
# Clone repository
git clone https://github.com/2332239652/NovelAI_MCP.git
cd NovelAI_MCP

# Install dependencies
npm install

# Build
npm run build
```

### Configuration

#### Option 1: Stdio Mode (Claude Desktop)

Add to Claude Desktop config:

```json
{
  "mcpServers": {
    "novelai": {
      "command": "node",
      "args": ["path/to/project/dist/index.js"],
      "env": {
        "NOVELAI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

#### Option 2: Streamable HTTP Mode (LobeChat/Dify Recommended)

**Linux/Mac:**
```bash
export NOVELAI_API_KEY="your-api-key"
export HTTPS_PROXY="http://127.0.0.1:7890"  # Optional: Set proxy
npm run start:http
```

**Windows PowerShell:**
```powershell
$env:NOVELAI_API_KEY="your-api-key"
$env:HTTPS_PROXY="http://127.0.0.1:7890"  # Optional: Set proxy
npm run start:http
```

**Windows CMD:**
```cmd
set NOVELAI_API_KEY=your-api-key
set HTTPS_PROXY=http://127.0.0.1:7890
npm run start:http
```

Configure in client:
- **URL**: `http://localhost:3000/mcp`
- **Transport**: Streamable HTTP

#### Option 3: SSE Mode (Alternative)

**Linux/Mac:**
```bash
export NOVELAI_API_KEY="your-api-key"
export HTTPS_PROXY="http://127.0.0.1:7890"  # Optional
npm run start:sse
```

**Windows PowerShell:**
```powershell
$env:NOVELAI_API_KEY="your-api-key"
$env:HTTPS_PROXY="http://127.0.0.1:7890"
npm run start:sse
```

**Windows CMD:**
```cmd
set NOVELAI_API_KEY=your-api-key
set HTTPS_PROXY=http://127.0.0.1:7890
npm run start:sse
```

Configure in client:
- **URL**: `http://localhost:3000/sse`
- **Transport**: Server-Sent Events (SSE)

## 🎯 Supported Models

The current version defaults to the latest NovelAI V5 Full, with V5 Curated and V4.5 also supported:

| Model | Description |
|------|------|
| `nai-diffusion-5-full` | NAI Diffusion V5 Full (default, newest & strongest) |
| `nai-diffusion-5-curated` | NAI Diffusion V5 Curated (curated subset) |
| `nai-diffusion-5-full-inpainting` | V5 Full inpainting model |
| `nai-diffusion-5-curated-inpainting` | V5 Curated inpainting model |
| `nai-diffusion-4-5-full` | NAI Diffusion V4.5 Full |
| `nai-diffusion-4-5-curated` | NAI Diffusion V4.5 Curated |

## 💡 Usage Examples

### Basic Text-to-Image

```typescript
// AI will automatically call the tool, just describe naturally
"Draw a blue-haired anime girl in school uniform under cherry blossoms"
```

AI generates parameters like:
```json
{
  "base_prompt": "masterpiece, best quality, cherry blossoms, detailed",
  "characters": [{
    "prompt": "1girl, blue hair, school uniform, beautiful eyes",
    "negative_prompt": "",
    "center_x": 0.5,
    "center_y": 0.5
  }],
  "width": 832,
  "height": 1216
}
```

### Multi-Character Scenes

```typescript
"Draw two characters talking, blue-haired girl on left reading, red-haired boy on right standing"
```

See [Examples Documentation](./docs/EXAMPLES.md) for more.

## 🔧 Core Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `model` | string | Model ID, default `nai-diffusion-5-full`, also accepts `nai-diffusion-5-curated`, `nai-diffusion-4-5-full`, etc. |
| `base_prompt` | string | Global scene and style description |
| `base_negative_prompt` | string | Global negative prompt |
| `characters` | array | Character array (V5 up to 32, V4.5 up to 6) |
| `width` / `height` | number | Image size (must be multiple of 64) |
| `steps` | number | Sampling steps; defaults to 23 for V5, 28 for V4.5 when omitted |

See [Quick Reference](./docs/QUICK-REFERENCE.md) for complete parameter list.

## 📊 Transport Mode Comparison

| Feature | Stdio Mode | Streamable HTTP | SSE Mode |
|---------|-----------|----------------|----------|
| **Use Case** | Claude Desktop | LobeChat, Dify (Recommended) | SSE Clients |
| **Protocol** | MCP Stdio | MCP Streamable HTTP | MCP SSE Transport |
| **Endpoint** | - | `/mcp` | `/sse` + `/message` |
| **Remote Access** | ❌ | ✅ | ✅ |
| **Multi-Client** | ❌ | ✅ | ✅ |
| **Proxy Support** | ❌ | ✅ | ✅ |
| **Start Command** | `npm run start:stdio` | `npm run start:http` | `npm run start:sse` |

## 🌍 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NOVELAI_API_KEY` | ✅ | - | NovelAI API key |
| `NOVELAI_MODEL` | ❌ | `nai-diffusion-5-full` | Default model ID when caller does not specify `model` |
| `NOVELAI_USE_PROXY` | ❌ | V5 defaults to true | `true` forces all generations through the mirror proxy; `false` forces V5 direct to official API; when unset, V5 uses proxy and V4.5 uses direct |
| `NOVELAI_SAVE_DIR` | ❌ | `%USERPROFILE%\Desktop\NovelAI_Output` | Image save directory; used when the environment variable is not set |
| `PORT` | ❌ | 3000 | HTTP server port (HTTP modes only) |
| `HTTPS_PROXY` | ❌ | - | HTTPS proxy address |
| `HTTP_PROXY` | ❌ | - | HTTP proxy address |

## 📚 Documentation

- 🚀 [HTTP Quick Start](./docs/QUICKSTART-HTTP.md)
- 🎨 [Usage Examples](./docs/EXAMPLES.md)
- 🎭 [Multi-Character Feature](./docs/CHARACTER-EXAMPLES.md)
- 📋 [Quick Reference Card](./docs/QUICK-REFERENCE.md)
- 📝 [Complete Feature Summary](./SUMMARY.md)
- 📜 [Changelog](./CHANGELOG.md)

## 🛠️ Development

```bash
# Clone repository
git clone https://github.com/2332239652/NovelAI_MCP.git
cd NovelAI_MCP

# Install dependencies
npm install

# Build
npm run build

# Development mode
npm run dev

# Start HTTP server
npm run start:http
```

## 🐳 Docker Deployment (Optional)

Dockerfile is included if you want to build it yourself:

```bash
# Build image
docker build -t novelai-mcp-server .

# Run container
docker run -d \
  -p 3000:3000 \
  -e NOVELAI_API_KEY="your-api-key" \
  --name novelai-mcp \
  novelai-mcp-server
```

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md).

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- [NovelAI](https://novelai.net/) - Powerful image generation API
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP specification
- [Anthropic](https://www.anthropic.com/) - MCP SDK and Claude

## 🔗 Links

- [NovelAI Official](https://novelai.net/)
- [NovelAI API Docs](https://api.novelai.net/docs/)
- [MCP Documentation](https://modelcontextprotocol.io/)
- [Issue Tracker](https://github.com/2332239652/NovelAI_MCP/issues)

---

<div align="center">

**If this project helps you, please give it a ⭐️!**

Made with ❤️ by the community

</div>
