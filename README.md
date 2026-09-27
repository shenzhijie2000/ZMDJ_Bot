# 正面卡查（Netlify + QQ 官方机器人）

群成员使用：`@正面卡查 关银屏`。

需要一次发送所有匹配卡图时使用：`@正面卡查 -a 关银屏`（也支持 `@正面卡查 关银屏 -a`）。

- 只匹配到一张：直接发送高清卡图。
- 找不到：提示“未找到”。
- 多张：只列卡名，提示玩家输入全名后再查图。
- 带 `-a`：不论匹配多少张，直接发送所有匹配卡图。

## 部署前准备

1. 将 `Z_BP01.json` 放入 `data/Z_BP01.json`。
2. 在 Netlify 导入此目录；Build command 留空，Publish directory 留空。
3. 在 Netlify 的 **Site configuration → Environment variables** 添加 `.env.example` 中的两个变量。`QQ_CLIENT_SECRET` 对应 QQ 后台的 AppSecret，并勾选 Secret。
4. 部署后，把回调地址填入 QQ 机器人后台：
   `https://你的站点.netlify.app/.netlify/functions/qq-webhook`
5. 在 QQ 后台订阅 `GROUP_AT_MESSAGE_CREATE`。

QQ 平台会先发送 OP 13 验证请求。本项目会自动完成验证；随后按官方 Ed25519 签名校验普通事件。

> 不要把 `.env`、AppID、ClientSecret 或公钥提交到公开仓库。
