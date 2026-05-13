---
name: security-incident-response
description: 安全应急响应专家：分析安全告警，通过 SIREN 在受害主机执行远程溯源调查，构建攻击链并生成中文应急响应报告。支持告警驱动和自由调查两种模式。
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

使用 `mcp__siren__run(client_id=<ID>, command=<命令>)` 执行命令。

### 并行执行组

以下命令互相独立，应通过**多个并行的 `mcp__siren__run` 调用同时执行**（一次性发出所有调用）：

```bash
# 组 1: 系统信息
uname -a && cat /etc/os-release

# 组 2: 时间和主机名
date && hostname

# 组 3: 高 CPU 进程
ps aux --sort=-%cpu | head -n 20

# 组 4: 活跃网络连接
netstat -antup | grep ESTABLISHED

# 组 5: 监听端口
ss -tlnp

# 组 6: 登录历史
last | head -n 30

# 组 7: 定时任务概览
crontab -l 2>/dev/null; ls -la /etc/cron.d/ 2>/dev/null

# 组 8: 最近 24 小时变动的文件（临时目录）
find /tmp /var/tmp /dev/shm -type f -mtime -1 -ls 2>/dev/null
```

### 告警/线索相关快速检查

根据告警类型或用户描述的异常，有针对性地**并行执行**以下检查（互相独立的检查应合并到同一轮调用中）：

```bash
# 涉及文件（可与下方进程/网络检查并行）
ls -la <文件路径> && stat <文件路径>

# 涉及进程
ps aux | grep <进程名>

# 涉及网络
netstat -antup | grep <IP或端口>
```

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

#### WebShell 告警判读补充

- 不要把可疑文件的 `atime` 自动判定为攻击者访问时间；云安全中心/SAS 扫描读取也会刷新访问时间。必须用 Web 访问日志、SAS 进程/网络遥测或 WAF 日志交叉验证。
- 若 nginx/Apache 日志中告警文件 0 命中，而文件 `atime` 与告警时间接近，应明确写成“告警扫描触发/文件存在告警”，不要写成“攻击者在该时间调用 WebShell”。
- WebShell 文件当前存在不等于当前可利用：检查 nginx/PHP 配置（例如 `location ~ \.php$ { return 403; }`、仅放行 `/index.php`）并实际核对访问日志状态码。
- 发现一个 WebShell 时，扩展排查同目录同时间段批量落地文件、压缩包和数据库探测脚本（常见：`shell*.php`、`s.php`、`mysql.php`、`db_*.php`、`dump*.php`、`rd*.php`、`rde*.php`、`arc.tar.gz`），并检查硬编码数据库凭据与数据导出风险。

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

### 3.4 并行执行模式

深度分析中的命令分为两类，按以下规则决定并行或串行：

**可并行**：不依赖其他命令输出的独立查询，应合并到同一轮调用。典型场景：
- 同一进程的不同维度：`cat /proc/<PID>/cmdline` + `ls -la /proc/<PID>/exe` + `lsof -i -P -n | grep <PID>` + `pstree -ap <PID>`（PID 已知时，这 4 个命令可一次性并行发出）
- 多个日志文件的同一模式搜索：对 access.log、error.log、auth.log 的 grep 可并行
- 多个持久化位置检查：crontab + systemd + rc.local + bashrc 可并行
- 文件哈希计算：`md5sum` + `sha256sum` 可并行

**必须串行**：依赖前一步输出才能确定参数的命令。典型场景：
- 先 `ps aux` 找到可疑 PID → 再查 `/proc/<PID>/...`
- 先 `grep` 日志定位攻击时间 → 再 `find -newermt` 搜索同时间段文件
- 先 `readlink /proc/<PID>/exe` 找到文件路径 → 再 `stat` / `md5sum` 该文件

**执行原则**：每轮拿到结果后，立即识别下一步中所有互相独立的命令，合并为一次并行调用。避免逐条串行执行独立命令。

### 3.5 分析原则

- **证据驱动**: 所有结论基于实际证据
- **灵活调整**: 根据发现的线索动态选择命令
- **场景化参数**: 命令中的时间范围、IP、关键字必须结合实际信息
- **合理推测**: 证据不足时可以推测，但需明确标注

---

## 步骤 4：漏洞定位和分析

基于溯源结果，识别被利用的具体漏洞：
- 漏洞类型（RCE、SQL 注入、文件上传、反序列化等）
- 受影响的组件和版本
- 攻击载荷（Payload）

使用 `WebSearch` 查询 CVE 编号、公开 Exploit、修复方案。

---

## 步骤 5：攻击链重建

**Read `references/attack_framework.md`** 获取 ATT&CK 战术/技术编号。

按攻击阶段映射：初始访问 → 执行 → 持久化 → 权限提升 → 防御规避 → 凭证访问 → 发现 → 横向移动 → 收集 → 命令与控制 → 数据外传 → 影响

**映射要求**: 使用具体子技术编号、提供证据支撑、未涉及的战术省略。

同时按时间顺序构建攻击时间线。

---

## 步骤 6：遗留风险排查

以下 6 个维度互相独立，应通过**并行 `mcp__siren__run` 调用同时执行**：

```bash
# 组 1: 恶意文件 — Web Shell、临时目录可疑文件
find /tmp /var/tmp /dev/shm -type f -ls 2>/dev/null

# 组 2: 持久化 — cron + systemd + 启动脚本
crontab -l 2>/dev/null; for u in $(cut -f1 -d: /etc/passwd); do echo "=== $u ==="; crontab -u $u -l 2>/dev/null; done; cat /etc/crontab 2>/dev/null; ls -la /etc/cron.d/ 2>/dev/null

# 组 3: 持久化 — systemd 服务 + rc.local + init.d
find /etc/systemd/system /usr/lib/systemd/system -type f -mtime -30 -ls 2>/dev/null; cat /etc/rc.local 2>/dev/null; ls -la /etc/init.d/ 2>/dev/null

# 组 4: 账户安全 — 新增账户 + SSH 密钥 + sudo 配置
awk -F: '$3 >= 1000 {print $1,$3,$7}' /etc/passwd; find /home /root -name "authorized_keys" -exec ls -la {} \; 2>/dev/null; ls -la /etc/sudoers.d/ 2>/dev/null

# 组 5: 网络连接 — 活跃连接 + 监听端口
netstat -antup 2>/dev/null; ss -tlnp 2>/dev/null

# 组 6: 系统完整性 + 配置文件
rpm -Va 2>/dev/null || dpkg -V 2>/dev/null; cat /etc/ld.so.preload 2>/dev/null; grep -l "LD_PRELOAD" /etc/profile /etc/profile.d/* /root/.bashrc /root/.bash_profile 2>/dev/null
```

根据结果进一步排查（如发现可疑项则深入调查）。

---

## 步骤 7：生成 Markdown 应急响应报告

报告模板位于 `<skill_root>/assets/report.md`，来源于 `dossier/report.md`。每份报告只需要在输出目录中生成一份填好的 `report.md`。

### 7.1 输出目录命名规范

```
IR-{YYYYMMDD}-{hostname}-{event_type}[-{event_id}]
```

**字段说明**:
- `IR-`：固定前缀（Incident Response），便于排序与过滤
- `{YYYYMMDD}`：事件发生日期（优先使用告警时间，其次使用调查时间）
- `{hostname}`：受影响主机名（不含域名后缀，特殊字符转 `-`）
- `{event_type}`：事件类型 slug（见下表），未知时填 `unknown`
- `{event_id}`：仅模式一包含，用于区分同主机多起事件

**事件类型 slug 对照表**:

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

**示例**:
- 模式一：`IR-20260417-web01-webshell-123456/`
- 模式二：`IR-20260417-db-prod-rce/`

### 7.2 生成步骤

1. **确定输出路径**：调用 Skill 时的当前工作目录下，新建 `IR-…/` 目录
2. **拷贝模板**：将 `<skill_root>/assets/report.md` 复制为 `IR-…/report.md`
3. **填充报告副本**：只编辑 `IR-…/report.md`，把模板占位说明替换为本次事件的实际数据
4. **只交付 Markdown**：不要创建 `index.html`、CSS/JS、字体资源或 dev server；本 skill 的交付物是 `report.md`

### 7.3 模板结构

生成时先 Read `assets/report.md`，再编辑输出目录中的 `report.md`。保留 Markdown 标题、frontmatter 和 `:::` 指令块，只替换占位内容。

关键结构：
- **Frontmatter**：填写 `date`、`sir-seq`、`version`、`client`
- **封面块**：填写 `::: cover-hero` 与 `::: cover-meta`
- **事件概述**：填写 `::: asset`、`::: timeline`、`::: callout`，以及事件定性、影响范围、处置状态、残留风险
- **技术分析**：填写排查过程、样本分析、入侵路径和 `::: attack`；仅给有证据支撑的 ATT&CK 技术加 `!`
- **响应行动与总结**：用 `[x]` / `[/]` / `[ ]` 区分已完成、进行中、未开始，并保留与本次事件直接相关的参考资料

不要把模板改写成 HTML，不要添加 `<span style=...>`、`<font>`、内联 `color` 或其他视觉样式。

### 7.4 报告要求

- **语言**: 简体中文
- **证据**: 每个结论需要证据支撑；对云安全中心/SLS 类证据必须写明日志源、时间窗口、最早/最新记录与覆盖限制。主机侧报告至少覆盖网络外联、进程启动、远程/数据库登录、SAS 告警四类；即使进程侧没有命令执行证据，也要写明进程日志最早覆盖时间，避免把“未检出”误写成“未发生”
- **IoC**: 完整提取所有网络/文件/进程/账户 IoC；报告可见文本里的 IPv4 地址统一做展示层转义，只把最后一个点替换成 `[.]`，例如 `1.1.1.1` 写成 `1.1.1[.]1`。执行命令、检索过滤和内部分析仍使用原始 IP，不要把转义形式拿去跑命令
- **可操作性**: 提供具体的修复建议和操作步骤
- **命令证据**：把在 SIREN 执行过的关键命令与关键输出片段粘进对应章节的证据代码块，不再单独输出 commands 日志
- **样式**：保留 Markdown 模板的标题、frontmatter 和 `:::` 指令块，不要添加 HTML/CSS 内联样式、字体颜色或背景色；核心结论只填写内容，不改视觉样式

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
| Markdown 报告模板 | `assets/report.md` | 步骤7：复制到 `IR-…/report.md` 后原地编辑 |

---

## 重要注意事项

### 命令执行原则（严格遵守）

- **只读**: 仅允许 cat, grep, find, ls, ps, netstat, lsof 等只读命令。严禁 `rm`、`mv`、`kill`、`dd`、`>` 覆盖重定向等破坏性操作
- **限制输出**: 用 `tail -n N`、`head -n N`、`grep` 过滤，先 `wc -l` 评估大文件
- **场景化参数**: 命令中的时间范围、IP、关键字必须结合实际告警信息填充

### 并行执行

- 互相独立的命令应通过多个并行的 `mcp__siren__run` 调用同时执行
- 有依赖关系的命令（如先获取 PID 再查进程详情）必须顺序执行

### 异常处理

- **SIREN 命令超时或失败**: 记录失败，尝试简化命令后重试一次，仍失败则跳过并在报告中标注
- **客户端断线**: 告知用户，等待重连或切换到备用客户端
- **日志被清除**: 标注为"日志已被攻击者清除"，转向其他证据源（进程、网络、文件时间戳等）
- **疑似误报**: 向用户说明判断依据，确认后结束调查

### 分析原则

- 所有结论基于实际证据；证据不足时可推测但需明确标注
- 使用 `WebSearch` 查询 CVE 详情、IP 归属地、文件哈希（VirusTotal）、威胁情报
- 输出语言：简体中文
