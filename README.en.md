# NovelAI MCP Server

> 📌 **This repository is a fork/derivative of [SGSxingchen/NovelAI_MCP](https://github.com/SGSxingchen/NovelAI_MCP)**, preserving the original author's full commit history. Thanks to the original author for their work.

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

- 🎨 **Latest Model Support** - Full support for NAI Diffusion V4.5 Full
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

Current version focuses on the latest NovelAI V4.5 model:

| Model | Description |
|------|------|
| `nai-diffusion-4-5-full` | NAI Diffusion V4.5 Full (Only supported model) |

> **Note**: This project is specifically optimized for V4.5 Full with complete feature support (Auto SMEA, Brownian noise, multi-character positioning, etc.). For other models, please refer to earlier versions or submit an Issue.

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
| `base_prompt` | string | Global scene and style description |
| `base_negative_prompt` | string | Global negative prompt |
| `characters` | array | Character array (required for both single/multi) |
| `width` / `height` | number | Image size (must be multiple of 64) |
| `steps` | number | Sampling steps (locked to 28, free tier limit) |

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
