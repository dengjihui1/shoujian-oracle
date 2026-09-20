# 冻结知识包与许可

`shoujian-rag.v1.json` 是“墨衡小卦”服务端只读 RAG 数据包，包含：

- 64 条卦级片段：卦辞、《彖》和大象；
- 384 条爻级片段：爻辞和小象；
- 8 条《说卦》八卦取象片段。

数据来自中文维基文库《周易》逐卦页面及《易传／说卦》的固定修订。古籍作品本身属于公有领域；中文维基文库的转录、校对和编辑性贡献按页面标示适用 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/legalcode.zh-hans)。本仓库执行了字段筛选、分段、命名规范化和 JSON 结构化，并按相同许可提供适用的数据改编部分。

- 《周易》入口：<https://zh.wikisource.org/wiki/周易>
- 《易传／说卦》：<https://zh.wikisource.org/wiki/易傳/說卦>
- 每卦实际来源 URL、页面 ID、修订 ID、修订时间和源 wikitext SHA-256 均保存在数据记录内。

该数据包是自动摘录后的检索材料，并非逐字人工校本。它只用于说明经传文本与传统取象，不构成现实因果、吉凶保证、医疗、法律、投资或人身安全建议，也不表示维基文库、维基媒体基金会或页面贡献者为本项目背书。

重新导入已经过来源审查的同结构数据时运行：

```powershell
node scripts/import-open-knowledge.mjs --zhouyi <zhouyi.v1.json> --shuogua <shuogua.v1.json>
```
