# 应急响应报告命名规范

应急响应报告统一在调用 skill 时的**当前工作目录**生成一个 Markdown 文件，文件名遵循以下规范。

## 文件名格式

```
IR-{YYYYMMDD}-{hostname}-{event_type}[-{event_id}].md
```

## 字段说明

| 字段 | 说明 |
|------|------|
| `IR-` | 固定前缀（Incident Response），便于排序与过滤 |
| `{YYYYMMDD}` | 事件发生日期（优先使用告警时间，其次使用调查时间） |
| `{hostname}` | 受影响主机名（不含域名后缀，特殊字符转 `-`） |
| `{event_type}` | 事件类型 slug（见下表），未知时填 `unknown` |
| `{event_id}` | 仅模式一包含，用于区分同主机多起事件 |

## 事件类型 slug 对照表

| 中文事件类型 | slug |
|------------|------|
| Web Shell 后门 | `webshell` |
| 挖矿木马 | `miner` |
| 反弹 Shell | `revshell` |
| 暴力破解 | `brute` |
| 异常登录 | `abnlogin` |
| 权限提升 | `privesc` |
| 数据外传 | `exfil` |
| 勒索软件 | `ransom` |
| SQL 注入 | `sqli` |
| 远程代码执行 (RCE) | `rce` |
| 持久化后门 | `backdoor` |
| 其他/未分类 | `unknown` |

## 示例

- 模式一（告警驱动）：`IR-20260417-web01-webshell-123456.md`
- 模式二（自由调查）：`IR-20260417-db-prod-rce.md`
- 多个事件同主机同日：`IR-20260417-web01-webshell-123456.md` 与 `IR-20260417-web01-revshell-123789.md`
