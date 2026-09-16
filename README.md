# 守简 · 虚拟卦师

一个零依赖、本机运行的轻量虚拟卦师 Web Component。它用三枚钱六次起卦，展示上下卦、动爻和一句克制的整理提示；不联网、不保存问题，也不假装预测现实结果。

![版本](https://img.shields.io/badge/version-0.1.0-8e332a)
![许可](https://img.shields.io/badge/license-MIT-d3b27f)

## 为什么做得很小

这个仓库只是一枚可以嵌入网页的传统文化体验插件，不是完整命理平台。它有意不包含住宅分析、古籍全文、纳甲、干支时证、用户档案、付款或账户系统。

## 功能

- 原生 `<shoujian-oracle>` 自定义元素，可嵌入任意静态页面；
- 使用浏览器密码学随机源模拟三钱六掷；
- 计算层为可测试纯函数，用户的问题文字不参与起卦；
- 原创虚拟卦师“守简”与响应式暗色中式界面；
- 无第三方依赖、无网络请求、无存储、无遥测；
- 明确限制为传统文化与娱乐体验。

## 本地运行

直接使用任意静态服务器打开根目录。例如：

```bash
npx serve .
```

然后访问终端显示的本地地址。直接打开 `index.html` 也可在多数现代浏览器运行，但静态服务器更稳定。

## 嵌入自己的网页

复制 `src/oracle-engine.js` 与 `src/shoujian-oracle.js`，然后在页面中加入：

```html
<script type="module" src="./src/shoujian-oracle.js"></script>
<shoujian-oracle></shoujian-oracle>
```

组件使用 Shadow DOM，样式不会污染宿主页面。

## 验证

需要 Node.js 20 或更高版本：

```bash
npm test
npm run check
```

## 内容边界

本项目不提供医疗、法律、投资或其他专业建议，不输出生死、灾祸、疾病、收益或保证性预测。请勿据此作高风险现实决定。

## License

[MIT](LICENSE)

