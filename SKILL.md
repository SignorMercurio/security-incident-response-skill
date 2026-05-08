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
7. 生成 HTML 应急响应报告

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
| 挖矿木马 | `references/invest_mining.md` |
| 反弹 Shell | `references/invest_reverse_shell.md` |
| 暴力破解 | `references/invest_brute_force.md` |
| 异常登录 | `references/invest_abnormal_login.md` |
| 权限提升 | `references/invest_privilege_escalation.md` |
| 数据外传 | `references/invest_data_exfiltration.md` |
| 勒索软件 | `references/invest_ransomware.md` |
| SQL 注入 | `references/invest_sql_injection.md` |
| 远程代码执行 (RCE) | `references/invest_rce.md` |
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
| 需要进程关联或文件时间分析 | `references/tech_process_file.md` |
| 发现进程隐藏/命令替换/Python注入 | `references/tech_attack_countermeasures.md` |
| 需要威胁情报查询 | `references/tech_threat_intel.md` |

**注意**: 调查指南和实战技巧中的命令仅供参考，实际执行时需根据具体情况调整参数。

### 3.3 并行执行模式

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

### 3.4 分析原则

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

## 步骤 7：生成 HTML 应急响应报告

报告模板是一个自包含的 HTML 静态站点，位于 Skill 目录下的 `assets/report-template/`（内含 `index.html` + `editor.css` + `editor.js` + `assets/`）。每份报告是一个目录拷贝 + 原地修改 `index.html`。

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
2. **拷贝模板**：将 `<skill_root>/assets/report-template/` 的全部内容拷到上一步的目录。相对路径的 `editor.css` / `editor.js` / `assets/logo.png` / 字体都必须跟着走，不要只拷 `index.html`
3. **原地编辑 `index.html`**：用 Edit 工具替换模板中的示例内容为本次事件的实际数据（见 §7.3 数据槽位清单）
4. **不要运行 dev server**：输出是静态文件。用户用浏览器直接打开 `index.html` 查看，或在浏览器里点右上角 `⤓ 导出 PDF` 获得可分发的 PDF

### 7.3 数据槽位清单

模板的占位内容都已填好了示例（一个 AK 泄露事件），生成时按章节逐个替换。关键槽位：

**封面（§ 一 · 服务概述前的 `.cover-*` 区块）**
- `.client`：客户名称（形如"某某科技有限公司"）
- `[data-var="date"]`：报告日期，`YYYYMMDD` 格式（与目录名中的 `{YYYYMMDD}` 一致）
- `[data-var="sir-seq"]`：当日序号，默认 `01`，同一客户当日多份报告递增
- 封面左侧大字 `.cover-hero` 下的 `.sev`（级别：高危/中危/低危）、`.cat`（事件类型标签）、`.sub`（事件简述）
- 封面下方 `.cover-meta` 字段：事件编号、处置状态、完成日期等

**§ 一 · 服务概述**：背景、范围、方法——通常轻度定制即可

**§ 二 · 事件回顾**：核心章节
- `.timeline`：攻击时间线，按 `<div class="tl-item">` 逐条填
- `.chain`：攻击链可视化步骤，每个 `<div class="step">` 是一环
- `.verdict` 下的 `.kv`：事件定性、影响范围、处置状态、残留风险四项

**§ 三 · 技术分析**：漏洞/载荷/IoC 等
- `.attack-grid`：MITRE ATT&CK 战术×技术映射
- 关键证据代码块、载荷分析等

**§ 四 · 处置与加固**
- `.actions`：处置措施，每条一个 `<div class="action">`
- `.asset-card`：受影响资产卡片
- 长短期加固建议

**§ 五 · 附录与声明**
- IoC 清单、引用资料
- 末页法律声明（通常不变）

**原则**：读取模板里每个区块的示例结构，**保留 HTML 骨架**（class/data-* 属性不动），只替换文字与数值。不确定结构时用 Read + Edit，禁止整块 innerHTML 重写。

### 7.4 报告要求

- **语言**: 简体中文
- **证据**: 每个结论需要证据支撑
- **IoC**: 完整提取所有网络/文件/进程/账户 IoC；报告可见文本里的 IPv4 地址统一做展示层转义，只把最后一个点替换成 `[.]`，例如 `1.1.1.1` 写成 `1.1.1[.]1`。执行命令、检索过滤和内部分析仍使用原始 IP，不要把转义形式拿去跑命令
- **可操作性**: 提供具体的修复建议和操作步骤
- **命令证据**：把在 SIREN 执行过的关键命令与关键输出片段粘进对应章节的证据代码块，不再单独输出 commands 日志
- **样式**：保留模板的配色和字体层级，不要给正文、标题或“Headline · 核心结论”区域额外添加 inline `color`、`font`、`background` 等视觉样式。核心结论是黑底区域，文字必须使用模板默认浅色，禁止改成黑色或其他奇怪颜色

---

## 资源文件索引

| 类型 | 文件 | 使用时机 |
|------|------|---------|
| 调查指南 | `references/invest_*.md` (12个) | 步骤3：按告警类型按需加载 |
| 实战技巧 | `references/tech_*.md` (6个) | 步骤3：按场景按需加载 |
| ATT&CK 框架 | `references/attack_framework.md` | 步骤5：攻击链映射时加载 |
| HTML 报告模板 | `assets/report-template/` | 步骤7：整目录拷贝到 cwd 后原地编辑 `index.html` |

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
