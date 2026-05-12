# 云端日志查询路由（WAF / 云安全中心 SLS）—— 通过 `sls` skill

主机侧日志（nginx/apache `access.log`、`auth.log`、`journalctl` 等）经常被攻击者清除、被轮转丢掉，或根本定位不到。需要**交叉验证攻击者真实 IP、攻击时间窗、命中的 WAF 规则、进程启动链、登录来源**时，**通过 `Skill` 工具调用 `sls` skill** 查询阿里云云端日志（也可直接 `Read ~/.agents/skills/sls/SKILL.md` 按其用法跑命令）。

## 前提：UID

`sls` 查询必须有 UID。
- **告警驱动模式**：UID 已知，直接用。
- **自由调查模式**：用户没给 UID 时先索取；拿不到就跳过云端查询，并在报告里写明「未做云端日志交叉验证」。

## 什么场景查什么 —— 路由表

| 攻击 / 告警类型 | 调用 `sls` skill 查 | 关注点 / query 思路 |
|---|---|---|
| **Web 类攻击**：WebShell、SQL 注入、RCE / 命令注入、文件上传、面向公网应用的利用 | `-product waf` | 按 `host` + `request_path` / `request_uri` + `real_client_ip` + `final_action` / `final_rule_id` + `time` 过滤，定位上传/利用请求和**攻击者真实 IP**（WAF 看到的才是真实 IP，不是 SLB / Nginx 后面的内网 IP）。⚠️ 解读坑：`waf_action='block'` ≠ 实际拦截，必须结合 `waf_test`、`final_action`、`final_plugin`、`upstream_status`、`status` 一起判断；`waf_test='true'` 且 `final_action` 空、`upstream_status` 是正常码（如 200）时，是核心防护测试/观察模式命中，不是真拦截。详见 `sls` skill 的 `references/waf-ddos-and-test-mode-interpretation.md` |
| **恶意进程**：挖矿、可疑二进制、RCE 后续命令执行 | `-product sas`，topic `aegis-log-process`（必要时配 `aegis-log-network`） | 按 `instance_id` + `proc_name` / `proc_path` / `cmdline` / `pcmdline` / `parent_proc_name` 过滤，还原进程启动链和**父进程**（确认是 Web 进程拉起、cron 拉起、还是登录后手动执行）。⚠️ 时间字段如 `start_time` 是字符串，要 `from_unixtime(CAST(start_time AS bigint))`；`proc_start_time` 可能是 `N/A` 或空，先 `WHERE proc_start_time != 'N/A' AND proc_start_time != ''` |
| **反弹 Shell / C2 外联 / 数据外传** | `-product sas`，topic `aegis-log-network`（DNS 类配 `aegis-log-dns-query`） | 按 `instance_id` + `dst_ip` / `dst_port` / `proc_name` / `cmdline` 过滤，提取外联目标和发起进程。涉及 DNSLog/带外域名见下一行 |
| **DNSLog / 带外域名请求**（dnslog.cn、interact.sh、oast、burpcollaborator 等） | `-product sas`，topic `aegis-log-dns-query` | 见 `references/oob_dnslog_investigation.md`；提取 `domain`、`host_ip`、`pid` / `ppid`、`proc_path`、`cmdline`、`cmd_chain` |
| **异常登录 / 暴力破解** | `-product sas`，topic `aegis-log-login` + `sas-security-log` | `aegis-log-login` 是原始登录遥测（含 SSH / RDP / 数据库登录），`sas-security-log` 是云安全中心告警（如 `异常登录-ECS非常用时间登录`，含 RDP 源 IP、用户、协议、客户端 IP）。按 `instance_id` / `src_ip` / `host_ip` 过滤；暴力破解关注失败→成功的转折点和源 IP |
| **AK 泄露 / 云助手滥用 / API 调用溯源** | `-product actiontrail` | 见 `references/tech_cloud.md`；按 `"event.eventName"`、`"event.userIdentity.*"` 等过滤；`RunCommand` / `InvokeCommand` / `CreateUser` / `AttachPolicyToUser` 是重点 API |
| **应用防护 / RASP（表达式注入等）** | `-product sas`，topic `sas-rasp-log` | 让 `sls` skill 加载它的 `references/sas-rasp-expression-injection.md` |

> WebShell 的上传源 IP 溯源还可参考本目录的 `aspnet_webshell_upload_tracing.md`；SAS 主机遥测的覆盖时间窗算法、`w3wp.exe` 子进程解读、报告措辞要求见本目录的 `sas_sls_host_telemetry.md`。

## 调用要点

- **不要在本 skill 里重抄 `sls` 的用法细节**。`sls` skill 自带 query 语法（`references/syntax-reference.md`）、现成示例（`references/query-examples.md`）、WAF 测试模式/高防解读（`references/waf-ddos-and-test-mode-interpretation.md`）、Log Audit 中心项目（`references/log-audit-central-projects.md`）等参考文件 —— 需要时让它自己加载。本文件只负责「什么场景该去查什么」。
- 优先用 **metadata 模式**（`-uid <UID> -product <sas|waf|actiontrail>`），不知道确切 project/logstore 时它会自己找；已知 `region + project + logstore` 时用 direct 模式（仍要带 `-uid`）。
- query 用 `[filter] | SELECT 字段 LIMIT n` 的形式，不要 `SELECT *`（除非探 schema）；schema 不确定先 `SELECT * LIMIT 3` 探一次再收窄。
- 云端日志是**补充证据源**，主线仍是 SIREN 在受害主机上跑只读命令；只在主机侧证据缺失/不足或需要交叉验证时才调 `sls` skill。
- 拿到结果后，报告里必须写明：**日志源**（region/project/logstore 或 product+topic）、**查询时间窗**、**最早/最新记录**、**查询语句**、**覆盖限制**（云安全中心未安装时期查不到、SLS 有保留期）。不要把「未检出」写成「未发生」。
