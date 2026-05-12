# Alibaba Cloud SAS SLS host telemetry notes

Use when building customer-facing IR timelines from Alibaba Cloud Security Center (`sas`) SLS logs.

> **执行查询走 `sls` skill**（通过 `Skill` 工具调用，或 `Read ~/.agents/skills/sls/SKILL.md`）。先看 `references/cloud_log_queries.md` 决定查哪个 `-product` / topic。本文件只补充**本环境特有的坑和报告措辞要求**：时间戳 CAST、`proc_start_time` 过滤、`w3wp.exe` 子进程解读、覆盖时间窗的报告写法。下面的 `sls` 命令示例可以直接给 `sls` skill 当模板。

## Core topics

- `__topic__: aegis-log-network` — host network connection telemetry.
- `__topic__: aegis-log-process` — process start telemetry.
- `__topic__: aegis-log-login` — login/remote connection/database login telemetry.
- `__topic__: aegis-log-dns-query` — per-process DNS query telemetry. Use this to confirm DNSLog/OOB-domain alerts and extract `domain`, `host_ip`, `pid`, `ppid`, `proc_path`, `cmdline`, and `cmd_chain`.
- `__topic__: sas-security-log` — Security Center alert events such as abnormal login and WebShell findings.

Always state the queried time window and the earliest/latest record per topic. Do not imply absence of execution if a telemetry source starts after the attack window.

## Timestamp handling

In this environment, fields such as `start_time` may be stored as strings. `from_unixtime(start_time)` can fail with `Unexpected parameters (varchar) for function from_unixtime`. Cast first:

```sql
from_unixtime(CAST(start_time AS bigint))
```

Some process logs have human-readable `proc_start_time`; it may contain `N/A` or empty values. Filter carefully:

```sql
WHERE proc_start_time != 'N/A' AND proc_start_time != ''
```

## Coverage queries

Network coverage:

```bash
/usr/local/bin/sls -c /root/config/config.yaml -uid <UID> -product sas \
  -query "__topic__: aegis-log-network AND instance_id: <INSTANCE_ID> | SELECT MIN(from_unixtime(CAST(start_time AS bigint))) AS first_time, MAX(from_unixtime(CAST(start_time AS bigint))) AS last_time, COUNT(*) AS cnt LIMIT 10" \
  -from '<FROM>' -to '<TO>'
```

Process coverage:

```bash
/usr/local/bin/sls -c /root/config/config.yaml -uid <UID> -product sas \
  -query "__topic__: aegis-log-process AND instance_id: <INSTANCE_ID> | SELECT MIN(proc_start_time) AS first_proc_start, COUNT(*) AS cnt LIMIT 10" \
  -from '<FROM>' -to '<TO>'
```

Login coverage:

```bash
/usr/local/bin/sls -c /root/config/config.yaml -uid <UID> -product sas \
  -query "__topic__: aegis-log-login AND (instance_id: <INSTANCE_ID> OR src_ip: <HOST_IP> OR host_ip: <HOST_IP>) | SELECT MIN(from_unixtime(CAST(start_time AS bigint))) AS first_time, MAX(from_unixtime(CAST(start_time AS bigint))) AS last_time, COUNT(*) AS cnt LIMIT 10" \
  -from '<FROM>' -to '<TO>'
```

Security alert coverage:

```bash
/usr/local/bin/sls -c /root/config/config.yaml -uid <UID> -product sas \
  -query "__topic__: sas-security-log AND instance_id: <INSTANCE_ID> | SELECT name, COUNT(*) AS cnt, MIN(from_unixtime(CAST(start_time AS bigint))) AS first_time, MAX(from_unixtime(CAST(start_time AS bigint))) AS last_time GROUP BY name ORDER BY first_time ASC LIMIT 20" \
  -from '<FROM>' -to '<TO>'
```

## IIS / ASP.NET pivots

Find `w3wp.exe` outbound connections:

```bash
/usr/local/bin/sls -c /root/config/config.yaml -uid <UID> -product sas \
  -query "__topic__: aegis-log-network AND instance_id: <INSTANCE_ID> AND proc_name: w3wp.exe | SELECT dst_ip, dst_port, COUNT(*) AS cnt, MIN(from_unixtime(CAST(start_time AS bigint))) AS first_time, MAX(from_unixtime(CAST(start_time AS bigint))) AS last_time GROUP BY dst_ip, dst_port ORDER BY cnt DESC LIMIT 50" \
  -from '<FROM>' -to '<TO>'
```

Find `w3wp.exe` child processes:

```bash
/usr/local/bin/sls -c /root/config/config.yaml -uid <UID> -product sas \
  -query "__topic__: aegis-log-process AND instance_id: <INSTANCE_ID> AND (parent_proc_name: w3wp.exe OR pcmdline: w3wp.exe) | SELECT proc_start_time, proc_name, proc_path, parent_proc_name, username, cmdline, pcmdline ORDER BY proc_start_time ASC LIMIT 50" \
  -from '<FROM>' -to '<TO>'
```

Interpretation:
- `w3wp.exe -> csc.exe` under `.NET Framework*/Temporary ASP.NET Files` is commonly ASP.NET dynamic compilation; do not call it malicious by itself.
- `w3wp.exe -> cmd.exe/powershell.exe/certutil/bitsadmin/mshta/rundll32/regsvr32/wscript/cscript` is stronger execution evidence.
- `w3wp.exe` connecting to external SSH port 22 is abnormal unless the customer confirms SFTP/SSH business logic.

## Reporting requirements

For customer reports, include a compact table:

`日志类型 | 最早时间 | 最新时间 | 数量 | 结论`

Include process telemetry even when negative. A good wording:

“当前未在 SAS 进程日志中发现 w3wp.exe 直接拉起 cmd.exe、powershell.exe 等典型命令执行链路；但 SAS 进程启动日志最早仅覆盖到 <FIRST_PROC_TIME>，无法覆盖 <ATTACK_WINDOW> 的早期攻击窗口，因此不能据此完全排除早期命令执行。”

For abnormal login, distinguish raw login telemetry from Security Center alert telemetry. `aegis-log-login` may include SQL Server/database login records; `sas-security-log` contains alert names such as `异常登录-ECS非常用时间登录` with details including RDP source IP, user, protocol, and client IP.
