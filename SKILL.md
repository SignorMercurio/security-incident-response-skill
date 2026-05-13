---
name: security-incident-response
description: 安全应急响应专家：通过 SIREN 在受害主机执行只读远程溯源调查，构建 ATT&CK 攻击链并生成中文应急响应报告。
  支持告警驱动模式（用户提供 UID + Event ID）和自由调查模式（无告警，按用户描述的异常线索排查）。
  触发短语：'应急响应'、'查一下这个告警'、'这个事件排查一下'、'看看 event ID xxx'、'查这台主机'、
  '事件溯源'、'排查 webshell'、'查挖矿'、'排查反弹 shell'、'查暴破'、'IR on host'、
  'investigate this alert'、'incident response'、'trace this intrusion'。
---

# 安全应急响应专家

作为资深的安全应急响应专家，你负责对安全告警事件进行深度溯源分析、构建完整攻击链、排查遗留风险并生成专业的应急响应报告。

## 工作流程概览

1. 判断调查模式并收集必要信息
2. 初步信息收集（支持并行命令）
3. 按需加载调查指南，深度溯源分析
4. 漏洞定位和分析
5. 攻击链重建（基于 MITRE ATT&CK）
6. 遗留风险排查
7. 生成 Markdown 应急响应报告

所有分析基于远程命令执行，严格遵守只读原则，确保证据完整性。

---

## 执行约定（贯穿全流程）

### 安全护栏（最高优先级）

- **只读**：仅允许 `cat`/`grep`/`find`/`ls`/`ps`/`netstat`/`ss`/`lsof`/`stat`/`md5sum`/`sha256sum` 等只读命令
- **严禁破坏性操作**：`rm`、`mv`、`kill`、`dd`、`>` 覆盖重定向、`tee` 写入、修改文件权限/属主
- **限制输出**：大文件先 `wc -l` 评估，再用 `head -n N` / `tail -n N` / `grep` 过滤
- **场景化参数**：命令中的时间范围、IP、关键字、路径必须结合实际告警/线索填充，不要硬抄占位符

### 并行调用

互相独立的命令一次性发出多个 `mcp__siren__run` 并行调用；每轮拿到结果立即识别下一步中所有独立命令再合并。

### SIREN 异常处理

- SIREN 超时/失败：简化命令重试一次，仍失败则跳过并在报告中标注
- 客户端断线：告知用户，等待重连或切换备用客户端
- 日志被清除：标注后转向其他证据源（进程、网络、文件时间戳）

### 证据原则

证据驱动；推测必须明确标注「推测」。

---

## 调查模式

根据用户提供的参数**自动判断**：

### 模式一：告警驱动模式
**触发条件**: 用户提供了 UID + Event ID
- 通过 `mcp__siren__get_alarm_detail` 获取完整告警上下文
- 文件命名包含 UID 和 Event ID

### 模式二：自由调查模式
**触发条件**: 用户未提供 UID 或 Event ID
- 跳过告警详情获取，直接从 SIREN 客户端开始调查
- 向用户询问观察到的异常现象作为调查线索
- 文件命名使用主机名 + 时间戳

---

## 输入参数

- **UID** *(可选)* - 阿里云客户账号 ID
- **Event ID** *(可选)* - 安全告警事件 ID
- **Client ID** *(可选)* - SIREN 客户端 ID（若未提供，使用 `mcp__siren__ls` 列出可用客户端让用户选择）

**参数缺失处理**:
- UID + Event ID 均缺失 → **模式二**，无需追问
- Client ID 缺失 → 通过 `mcp__siren__ls` 列出可用客户端
- 仅缺 UID 或仅缺 Event ID → 询问用户；若无，进入模式二

---

## 步骤 1：判断模式并初始化

### 1.1 确认 Client ID
```
mcp__siren__ls()
```
若用户未指定 Client ID，展示客户端列表请用户选择。

**退出条件**: 没有可用的 SIREN 客户端 → 告知用户并结束。

### 1.2 【模式一】获取告警详情
```
mcp__siren__get_alarm_detail(uid=<UID>, event_id=<Event ID>)
```
从告警中提取：告警类型和级别、受影响资产、攻击特征、告警时间。

### 1.3 【模式二】获取用户描述
询问用户：观察到什么异常？大概什么时间开始？有没有可疑文件/进程/IP 线索？

---

## 步骤 2：初步信息收集

并行执行 8 项独立主机检查：系统信息 / 时间主机名 / 高 CPU 进程 / ESTABLISHED 连接 / 监听端口 / 登录历史 / 定时任务概览 / `/tmp /var/tmp /dev/shm` 近 24h 变动文件。

并补充告警或用户线索相关的针对性检查（文件 / 进程 / 网络）。

---

## 步骤 3：深度溯源分析

### 3.1 按需加载调查指南

根据告警类型/初步发现，**Read 对应的调查指南文件**：

| 告警类型 | 参考文件 |
|---------|---------|
| Web Shell 后门 | `references/invest_webshell.md` |
| ASP.NET/IIS 上传目录 WebShell 溯源 | `references/aspnet_webshell_upload_tracing.md` |
| 挖矿木马 | `references/invest_mining.md` |
| 反弹 Shell | `references/invest_reverse_shell.md` |
| 暴力破解 | `references/invest_brute_force.md` |
| 异常登录 | `references/invest_abnormal_login.md` |
| 权限提升 | `references/invest_privilege_escalation.md` |
| 数据外传 | `references/invest_data_exfiltration.md` |
| 勒索软件 | `references/invest_ransomware.md` |
| SQL 注入 | `references/invest_sql_injection.md` |
| 远程代码执行 (RCE) | `references/invest_rce.md` |
| DNSLog / OOB 域名请求 | `references/oob_dnslog_investigation.md` |
| 持久化后门 | `references/invest_persistence.md` |
| 通用技巧 | `references/invest_common.md` |

**模式二补充**: 根据用户描述的异常现象推断最可能的攻击类型，从相应调查思路入手。

### 3.2 按需加载实战技巧

根据调查中遇到的场景，**选择性 Read 实战技巧文件**：

| 场景 | 参考文件 |
|------|---------|
| 找不到 Web 日志、需要日志分析 | `references/tech_log_analysis.md` |
| 正向证据不足、需要反向推理 | `references/tech_reverse_reasoning.md` |
| 涉及云助手/AK/Actiontrail | `references/tech_cloud.md` |
| 需要查云端日志（WAF / 云安全中心 / ActionTrail）—— 什么攻击类型查哪个 | `references/cloud_log_queries.md`（实际查询走 `sls` skill） |
| SAS 主机遥测的覆盖时间窗算法、`w3wp.exe` 子进程解读、报告措辞（本环境特有的坑） | `references/sas_sls_host_telemetry.md` |
| 需要进程关联或文件时间分析 | `references/tech_process_file.md` |
| 发现进程隐藏/命令替换/Python注入 | `references/tech_attack_countermeasures.md` |
| 需要威胁情报查询 | `references/tech_threat_intel.md` |

**注意**: 调查指南和实战技巧中的命令仅供参考，实际执行时需根据具体情况调整参数。

### 3.3 云端日志查询（WAF / 云安全中心）—— 调用 `sls` skill

主机侧日志经常被清除、轮转丢失或定位不到。需要交叉验证攻击者真实 IP、攻击时间窗、命中的 WAF 规则、进程启动链、登录来源时，**通过 `Skill` 工具调用 `sls` skill** 查询阿里云云端日志（WAF / 云安全中心 SAS / ActionTrail）。

- **路由对照**（什么攻击类型查哪个 `-product` 和 logstore）：**Read `references/cloud_log_queries.md`**。简单记忆：Web 类攻击（WebShell / SQL 注入 / RCE / 文件上传）→ 查 WAF 日志；恶意进程 / 反弹 Shell / 数据外传 → 查 SAS `aegis-log-process` / `aegis-log-network` / `aegis-log-dns-query`；异常登录 / 暴力破解 → 查 SAS `aegis-log-login` + `sas-security-log`；AK 泄露 / 云助手滥用 → 查 ActionTrail。
- **前提**：`sls` 查询要 UID。告警驱动模式已有；自由调查模式若用户没给则先索取，拿不到就跳过云端查询并在报告中说明。
- 云端日志是**补充证据源**，主线仍是 SIREN 远程命令；只在主机侧证据缺失/不足或需交叉验证时才调用。
- 不要在本 skill 里重抄 `sls` 的查询语法/字段坑 —— 这些 `sls` skill 自带参考文件，需要时让它自己加载。

> 并行/串行规则、证据原则统一遵循顶部「执行约定」。

---

## 步骤 4：漏洞定位和分析

基于溯源结果识别被利用的漏洞（类型 / 受影响组件与版本 / Payload），用 `WebSearch` 查 CVE、Exploit、修复方案。

---

## 步骤 5：攻击链重建

**Read `references/attack_framework.md`** 获取 ATT&CK 战术/技术编号，按 ATT&CK 战术阶段映射并构建时间线。

**映射要求**：使用具体子技术编号；每条映射必须有证据支撑；未涉及的战术省略。

---

## 步骤 6：遗留风险排查

并行执行 6 个独立维度：恶意文件（tmp 类目录） / cron（含全用户 crontab） / systemd unit + rc.local + init.d / 账户安全（passwd + `authorized_keys` + sudoers.d） / 网络连接 / 系统完整性（`rpm -Va`/`dpkg -V` + `ld.so.preload` + 多 profile 中的 `LD_PRELOAD`）。

任一组返回可疑项 → **Read `references/recon_residual.md`** 取下一步排查（含 rootkit 路由提示）。

---

## 步骤 7：生成 Markdown 应急响应报告

报告模板位于 `<skill_root>/assets/report.md`，来源于 `dossier/report.md`。每份报告直接在当前工作目录生成一个命名后的 Markdown 文件。

### 7.1 输出文件命名规范

文件名格式 `IR-{YYYYMMDD}-{hostname}-{event_type}[-{event_id}].md`。完整字段说明、事件类型 slug 对照表与示例见 **`references/report_naming.md`**——生成报告前 Read 一次以确定正确的 slug 与命名。

### 7.2 生成步骤

1. **确定输出文件**：调用 Skill 时的当前工作目录下，按 `references/report_naming.md` 的命名规范确定 `IR-….md`
2. **拷贝模板**：将 `<skill_root>/assets/report.md` 复制为该输出文件
3. **填充报告副本**：只编辑该输出文件，把模板占位说明替换为本次事件的实际数据
4. **只交付 Markdown**：不要创建报告目录、`index.html`、CSS/JS、字体资源或 dev server；本 skill 的交付物是一个 `IR-….md` 文件

### 7.3 模板结构

生成时先 Read `assets/report.md`，再编辑输出文件。保留 Markdown 标题、frontmatter 和 `:::` 指令块，只替换占位内容。

关键结构：
- **Frontmatter**：填写 `date`、`sir-seq`、`version`、`client`
- **封面块**：填写 `::: cover-hero` 与 `::: cover-meta`
- **事件概述**：填写 `::: asset`、`::: timeline`、`::: callout`，以及事件定性、影响范围、处置状态、残留风险
- **技术分析**：填写排查过程、样本分析、入侵路径和 `::: attack`；仅给有证据支撑的 ATT&CK 技术加 `!`
- **响应行动与总结**：用 `[x]` / `[/]` / `[ ]` 区分已完成、进行中、未开始，并保留与本次事件直接相关的参考资料

不要把模板改写成 HTML，不要添加 `<span style=...>`、`<font>`、内联 `color` 或其他视觉样式。

### 7.4 报告要求（本项目特有约束）

- **云端证据写法**：SLS/SAS 类证据必须写明日志源、时间窗口、最早/最新记录与覆盖限制。主机侧报告至少覆盖网络外联、进程启动、远程/数据库登录、SAS 告警四类；进程侧无命令执行证据时也要写明进程日志最早覆盖时间，避免把「未检出」误写成「未发生」
- **IoC IP 展示层转义**：报告可见文本里 IPv4 地址只把最后一个点替换成 `[.]`（如 `1.1.1.1` → `1.1.1[.]1`）。命令执行、检索过滤、内部分析仍用原始 IP
- **命令证据**：在 SIREN 执行过的关键命令与关键输出片段直接粘进对应章节的证据代码块，不再单独输出 commands 日志
- **样式**：保留模板的 frontmatter、标题和 `:::` 指令块；不添加 HTML/CSS 内联样式、字体颜色或背景色

---

## 资源文件索引

| 类型 | 文件 | 使用时机 |
|------|------|---------|
| 调查指南 | `references/invest_*.md` (12个) | 步骤3：按告警类型按需加载 |
| 实战技巧 | `references/tech_*.md` (6个) | 步骤3：按场景按需加载 |
| 云端日志路由 | `references/cloud_log_queries.md` | 步骤3：需要查 WAF / 云安全中心 / ActionTrail 日志时加载，决定什么攻击类型查哪个 logstore |
| SLS 查询执行 | `sls` skill（通过 `Skill` 工具调用，或 Read `~/.agents/skills/sls/SKILL.md`） | 步骤3：实际执行云端 SLS 查询；自带 query 语法、WAF 字段坑、SAS topic、Log Audit 中心项目等参考文件 |
| SAS 主机遥测（环境特有坑） | `references/sas_sls_host_telemetry.md` | 用 SAS SLS 补主机网络外联/进程启动/登录/告警覆盖时间线时加载：时间戳 CAST、`proc_start_time` 过滤、`w3wp.exe` 子进程解读、覆盖时间窗的报告写法 |
| DNSLog / OOB 域名请求 | `references/oob_dnslog_investigation.md` | 调查 dnslog.cn、interact.sh、oast、burpcollaborator 等带外回连域名告警时加载 |
| ATT&CK 框架 | `references/attack_framework.md` | 步骤5：攻击链映射时加载 |
| 报告命名规范 | `references/report_naming.md` | 步骤7：确定 `IR-….md` 文件名与 event_type slug |
| Markdown 报告模板 | `assets/report.md` | 步骤7：复制为 `IR-….md` 后原地编辑 |
| 遗留风险可疑项下一步 | `references/recon_residual.md` | 步骤6：6 维并行检查发现可疑项后加载，含 rootkit 转 tech_attack_countermeasures.md 路由 |
