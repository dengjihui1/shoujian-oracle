# 0.11 性能与虚拟人架构调研

调研与实测日期：2026-09-22（Asia/Shanghai）。本文记录本轮实际参考的开源项目、官方接口资料、采用决策与没有采用的部分，避免把“参考过”写成含糊宣传。

## 一、对标项目与取舍

| 项目 | 值得借鉴的能力 | 守简 0.11 的取舍 |
| --- | --- | --- |
| [AIRI](https://github.com/moeru-ai/airi) | 多 LLM / ASR / TTS、记忆、缓存、可观测性 | 引入供应商适配、短时熔断、上下文预算和 TTS 缓存；不引入其完整桌面运行时 |
| [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) | 可替换 ASR / LLM / TTS、语音打断、Live2D | 保留可取消链路与适配器边界；当前人物继续使用许可清楚的双帧 2.5D 素材 |
| [TEN Framework](https://github.com/TEN-framework/ten-framework) | VAD、Turn Detection、RTC、Lip Sync | 把 VAD / 轮次检测列入真正全双工版本，不为当前按键式问答引入重型实时栈 |
| [LiveKit Agents](https://github.com/livekit/agents) | WebRTC、语义轮次检测、STT / LLM / TTS 插件化 | 借鉴插件化接口；多人房间、WebRTC 服务和部署成本超出轻量开源组件边界 |
| [Pipecat](https://github.com/pipecat-ai/pipecat) | 实时流水线、WebRTC / WebSocket、多供应商、Gemini Live | 借鉴分阶段流水线与取消传播；没有复制框架源码或引入 Python 服务 |
| [TalkingHead](https://github.com/met4citizen/TalkingHead) | 浏览器端音频队列、口型与 WebRTC 方向 | 已用 Web Audio RMS 驱动嘴部帧；viseme 和 3D 模型留作可选增强 |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | 本地流式中文 ASR、VAD、TTS | 适合作为隐私优先的后续可选后端；当前零依赖浏览器版不捆绑本地模型 |
| [FunASR](https://github.com/modelscope/FunASR) | 流式 ASR、VAD、标点、OpenAI-compatible 服务 | 可作为自托管语音入口；当前先保留浏览器实时识别和 Gemini 转写兜底 |
| [CosyVoice](https://github.com/FunAudioLLM/CosyVoice) | 双流式中文 TTS、低时延合成 | 适合生产自托管；当前版本先解决句级预取、缓存和重复请求合并 |
| [RAGFlow](https://github.com/infiniflow/ragflow) | 可追溯 RAG、上下文与评测意识 | 保留冻结证据、源号白名单和固定评测集，不引入独立向量数据库 |

以上项目只用于架构比较。本仓库没有复制它们的源码、模型或人物资产。

## 二、官方接口资料

- [Gemini Live API](https://ai.google.dev/gemini-api/docs/live)：后续全双工语音路线；当前版本仍使用更易审计的文字 SSE + 独立 TTS。
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)：模型额度会随账号、地区和时间变化，不能把免费额度写成产品保证。
- [Groq OpenAI Compatibility](https://console.groq.com/docs/openai) 与 [Rate Limits](https://console.groq.com/docs/rate-limits)：可作为低延迟文字兜底。
- [OpenRouter API](https://openrouter.ai/docs/api-reference/overview) 与 [Limits](https://openrouter.ai/docs/api-reference/limits)：可作为多模型统一备用入口。
- [Deepgram Streaming STT](https://developers.deepgram.com/docs/getting-started-with-live-streaming-audio)：适合真正生产级实时转写，但当前版本无需新增第二个语音密钥。

## 三、真实模型与端点实测

实测使用本机已有 Gemini 密钥和项目代理，未记录或输出密钥。结果是当前账号、当前网络的一次快照，不是长期 SLA。

| 场景 | 模型 / 路径 | 首包 | 总耗时 | 结果 |
| --- | --- | ---: | ---: | --- |
| 身份问答 | `gemini-3.1-flash-lite` | 3453 ms | 3636 ms | 正常流式回答 |
| 日期问答 | `gemini-3.1-flash-lite` | 1856 ms | 2044 ms | 正确使用 2026-09-22 服务端日期 |
| 经传 RAG（旧质量路由） | `gemini-3.5-flash` | 19275 ms | 20318 ms | 正确但过慢 |
| 经传 RAG（0.11 默认） | `gemini-3.1-flash-lite` | 1584 ms | 2466 ms | 正确引用 `ZY-01-LINE-1` |
| 质量备用探测 | `gemini-3.6-flash` | — | 18175 ms | 本次返回上游错误 |
| TTS 首次合成 | Gemini TTS | — | 6056 ms | 24 kHz 非空音频 |
| 相同 TTS 再请求 | 内存缓存 | — | 9 ms | 不再次调用供应商 |

因此默认选择“快速模型 + 严格 RAG 引用校验”，把 3.5 / 3.6 留作故障备用，而不是为了型号看起来更大，让每个经传问题等待二十秒。用户仍可用环境变量显式指定其他质量模型。

## 四、已经落地的改进

1. 普通聊天与经传 / 解卦分场景路由，并在 SSE `done` 中记录路由、模型、供应商、首包和总耗时；前端不展示供应商品牌。
2. Gemini 模型链失败后可切换 Groq、OpenRouter、SiliconFlow 或任意 OpenAI-compatible 服务；连续瞬态失败触发 30 秒熔断。
3. 最近上下文除 16 条上限外增加 6000 字符总预算，始终从最新消息向前保留。
4. TTS 增加 30 分钟 TTL、48 条 / 24 MB LRU 缓存；相同并发句子只合成一次，键只保存 SHA-256。
5. RAG 增加明确爻位、卦义和《说卦》取象意图；命中具体爻时不再把其他同位爻或整卦全部塞进上下文。
6. `evaluation/rag-cases.json` 固定正例、负例与当前卦案例；`npm run eval:rag` 同时检查质量和延迟预算。
7. 卦后仍允许独立问其他卦或《说卦》知识，不会因为当前页面有卦象就强制套用旧原问。

## 五、暂不引入的重型能力

- Gemini Live / WebRTC / VAD：只有在产品要做“用户随时插话、系统边听边答”的全双工语音时才值得引入；当前按键式转写已经更容易控制隐私、费用与打断。
- Live2D / VRM：会新增模型许可、GPU、下载体积和移动端兼容成本；当前人物已具备状态、开口与音量反馈，不为技术标签更换架构。
- 向量数据库：456 条冻结片段使用确定性检索可解释、快速且可测；数据规模扩大或加入大量现代注疏后再评估混合检索。
- 第二个语音付费 API：当前优先级低于文字供应商兜底；除非真实设备测试证明浏览器 ASR 或 Gemini TTS 无法满足目标，不要求用户多注册密钥。

## 六、下一道生产门槛

本轮优化把本地开源教学版推进到可重复验证状态，但公开收费服务仍需账号级配额、共享限流、账单告警、结构化脱敏日志、HTTPS、生产健康检查和多浏览器 / 真实手机语音矩阵。它们属于部署与运营层，不应伪装成已经由本地测试完成。
