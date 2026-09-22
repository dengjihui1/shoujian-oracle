# Cactus 语音链路模块拆解与守简映射

分析对象：[`BruceZZhao/Cactus`](https://github.com/BruceZZhao/Cactus)，本地可检查上游提交 `30fe21c5393595e5892b6e0db46da8d4572b072c`。分析日期：2026-09-22。

上游仓库当前没有 `LICENSE` 文件，因此本项目只学习其公开架构与运行机制，并使用自身命名、接口、错误处理和测试独立实现；没有复制 Cactus 源码、提示词、人物资料或向量库。

## 一、Cactus 的真实链路

```text
浏览器 AudioWorklet 产生 16 kHz PCM
  → WebSocket audio-in
  → Google Cloud streaming_recognize
  → interim / final 文本
  → 会话 ASR 队列
  → Gemini 流式文字
  → 按完整句进入 sentence_queue
  → Google Cloud synthesize_speech（每句完整返回）
  → audio bus / WebSocket audio-out
  → 浏览器严格顺序播放
```

它在产品层面是“边听、边生成、按句边合成”，但 `backend/service/tts.py` 使用的是每句一次 `synthesize_speech`：单句音频仍然要合成完成后才发送，并不是真正的单句内部音频分片流。

## 二、逐模块提取结果

| Cactus 模块 | 可取思想 | 守简对应模块 | 本轮决定 |
| --- | --- | --- | --- |
| `frontend/.../LiveTranscriber.tsx` | 麦克风生命周期、增量转写、可见状态 | `src/audio-recorder.js` | 用户明确选择浏览器 `SpeechRecognition`；不额外传 16 kHz PCM 到服务器 |
| `backend/service/asr.py` | interim / final 分离、最终文本才进入 LLM | `BrowserSpeechRecognizer` | 浏览器已提供同一契约；保留 Gemini 录音兜底，不引入 Cloud STT 成本 |
| `backend/service/llm.py` | Gemini 流式分片、按句推入 TTS | `server/gemini-client.mjs`、`src/speech-segmenter.js` | 已有 SSE 真流式与可测试中文分句，继续沿用 |
| `token_guard.py` | 新一轮令牌让旧回答、旧音频失效 | `AbortController`、`StreamingSpeechQueue.cancel()` | 已有相同语义；新问题会中止旧请求并淘汰旧播放 |
| `runtime/queues.py` / `bus.py` | LLM、TTS、播放解耦，严格顺序 | `src/speech-queue.js`、`server/speech-cache.mjs` | 已有两句有界预取、顺序播放、合并与 LRU |
| `backend/service/tts.py` | 独立 Google Cloud TTS 供应商 | `server/google-cloud-tts-client.mjs` | 本轮新增；有 Cloud 凭证时替代慢速 Gemini TTS |
| `frontend/.../AudioPlayer.tsx` | 一句一个播放单元、完成后再播下一句 | `src/audio-player.js`、`src/speech-queue.js` | 已有；守简额外使用 Web Audio RMS 驱动人物嘴型 |
| `runtime/session.py` | 会话历史与当前 generation token | `src/conversation-memory.js` | 只在浏览器保存完成轮次，服务端不建立用户档案 |
| 后台 Thinker | 长对话摘要、下一话题 | 当前未引入 | 会增加费用和模型编造记忆风险；先使用 6000 字上下文预算 |
| Qdrant 人物 RAG | profile embedding 检索 | `server/knowledge-retriever.mjs` | 456 条经传继续用确定性检索；大规模扩容时再升级混合向量检索 |

## 三、没有照搬的风险点

- 上游没有许可证，不能把公开可读误当成可复制授权；
- FastAPI CORS 使用 `*`，不适合匿名收费服务；
- 会话、队列与 audio bus 全在进程内，多实例需要共享状态；
- TTS 是句级流水线而非真正音频流式；
- 语音文本与日志输出需要在生产环境做脱敏；
- Google Cloud 凭证路径不应出现在公开日志中；
- 后台 Thinker 会增加调用次数，也可能把错误总结固化为记忆。

## 四、守简本轮新增架构

```text
浏览器 SpeechRecognition（首选、增量、无需项目语音密钥）
  → Gemini SSE 对话 / 周易 RAG
  → 中文完整句
  ├─ 极速浏览器语音
  └─ Google Cloud TTS（配置后默认云端音色）
       → Gemini TTS（未配置 Cloud 时兼容兜底）
  → 有界预取 / generation 取消 / 严格顺序播放
```

Google Cloud TTS 使用官方 `@google-cloud/text-to-speech` 客户端；支持 `GOOGLE_APPLICATION_CREDENTIALS` 服务账号 JSON，也支持只放在服务端 `.env` 的受限 `GOOGLE_CLOUD_TTS_API_KEY`。浏览器永远接触不到凭证。
