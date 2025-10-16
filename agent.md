## 项目愿景

Flareflow 的 AI 邮件助手负责在 GoDaddy IMAP 邮箱中自动处理每天数百封多语种用户来信。目标是帮助客服团队更快识别高优先级问题、生成结构化洞察，并在需要时提供挽留型草稿回复。系统最终要将分析结果同步到客服常用的工作渠道（如 Google 表格或即时通信工具），让人工介入变得更高效。

## 端到端流程（当前设计）

1. **邮件获取**  
   - 使用 `src/services/emailFetcher.ts` 连接 GoDaddy IMAP，支持按日期过滤、按小时范围、单日查询等模式，只抓取未读邮件且默认不标记已读。
   - `processingConfig`（见 `src/config/index.ts`）允许通过 `.env` 配置抓取窗口，例如 `FETCH_DATE=today` 或指定日期。
2. **预处理与脱敏**  
   - `src/services/emailProcessor.ts` 清洗正文、提取 UID / 版本号 / 设备 / 订单号 / 用户 ID，并对邮箱、手机号进行脱敏。
3. **LLM 分析（待实现）**  
   - 计划调用 Gemini 1.5 Pro（首选）或 GPT-4o/DeepSeek/Qwen，将预处理后的文本转成结构化 JSON：`summary`、`intent`、`priority` (P0–P2)、`sentiment`、`language`。
   - 需要支持 prompt 工程和多语场景；后续用户会提供邮件模版和 prompt。
4. **结果推送（待实现）**  
   - 目标渠道：Google Sheets / Feishu（或 Slack）Webhook，用于团队实时跟进。
5. **自动草稿（待实现，可选）**  
   - 针对退款、解锁失败等付费型问题，生成多语挽留式回复草稿，写入邮箱 Drafts 文件夹等待人工确认。

## 配置要点

`.env` / `.env.example` 里维护 IMAP 凭据和处理参数：  
`FETCH_INTERVAL_MINUTES`、`MAX_EMAILS_PER_FETCH`、`MARK_AS_READ`、`FETCH_DATE` 等。后续需要补充 LLM、Google API、飞书/Slack 等密钥。

## 尚未完成的核心模块

- LLM 调用层（Gemini/GPT/DeepSeek/Qwen 的统一封装与策略选择）。  
- 结果推送器（Sheets API、Webhook 集成）。  
- 草稿生成器（基于 LLM 输出写入 Drafts 文件夹）。  
- 调度器（定时轮询或 IMAP IDLE/Webhook 触发）。  
- Prompt 模版与回复模版的管理。

## TODO 方向提示

1. 与产品确认：  
   - LLM 主力及备用策略、费用优先级。  
   - 使用的即时通信平台（飞书或 Slack）。  
   - 自动草稿的触发条件、语言策略。
2. 实现 LLM 分析和推送链路，并为 Prompt/模版预留可配置结构。  
3. 在 Google 表格或 CSV 中记录已处理邮件，配合日期过滤避免首次运行处理历史邮件。  
4. 考虑是否需要轻量持久化（如 SQLite）用于重试、去重或审计；目前项目默认依赖 Sheets 作为记录源。  
5. 针对多语言输入补充测试数据，完善处理流程的单元测试/集成测试。

这份文档随需求演进更新，帮助快速回顾系统背景与当前进度。

