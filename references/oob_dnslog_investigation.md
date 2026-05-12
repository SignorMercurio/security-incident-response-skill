# DNSLog / OOB domain alert investigation notes

Use for Alibaba Cloud Security Center alerts such as “恶意DNS请求拦截”, “请求带外攻击(OOB)域名”, or when a suspicious domain ends in `dnslog.cn`, `interact.sh`, `oast.*`, `burpcollaborator.*`, `ceye.io`, etc.

## Interpretation

A DNSLog/OOB domain query is not a normal DNS false positive by default. It means a payload reached a process and triggered name resolution. Common causes include RCE probing, SSRF, SQL injection with out-of-band callback, template injection, JNDI/Log4j-style probes, or an application feature that resolves attacker-controlled input.

Do not overstate it as host compromise unless there is follow-on evidence: shell child processes, payload downloads, reverse connections, file writes, abnormal logins, persistence, or new alerts.

## SLS workflow

1. Find the exact alert records in `sas-security-log`:

```bash
/usr/local/bin/sls -c /root/config/config.yaml -uid <UID> -product sas \
  -query '__topic__: sas-security-log AND <domain> | SELECT from_unixtime(CAST(start_time AS bigint)) AS ts, suspicious_event_id, name, level, status, instance_id, intranet_ip, uuid, detail ORDER BY start_time ASC LIMIT 20' \
  -from '<FROM>' -to '<TO>'
```

2. Confirm the raw DNS event in `aegis-log-dns-query` and extract process context:

```bash
/usr/local/bin/sls -c /root/config/config.yaml -uid <UID> -product sas \
  -query '__topic__: aegis-log-dns-query AND (<domain> OR <lowercase-domain>) | SELECT * LIMIT 5' \
  -from '<FROM>' -to '<TO>'
```

Useful fields often include `domain`, `host_ip`, `instance_id`, `uuid`, `pid`, `ppid`, `proc_path`, `cmdline`, and `cmd_chain`. The DNS record may not have `answer`/`answer_rdata`; absence of an answer does not negate the suspicious DNS resolution.

3. Check whether the same domain or OOB root appears repeatedly:

```bash
/usr/local/bin/sls -c /root/config/config.yaml -uid <UID> -product sas \
  -query '<domain> OR <lowercase-domain> | SELECT __topic__, COUNT(*) AS cnt, MIN(__time__) AS first_unix, MAX(__time__) AS last_unix GROUP BY __topic__ LIMIT 20' \
  -from '<FROM>' -to '<TO>'
```

4. Hunt for follow-on execution from the flagged process/PID and common payload tools:

```bash
/usr/local/bin/sls -c /root/config/config.yaml -uid <UID> -product sas \
  -query '__topic__: aegis-log-process AND (ppid: <PID> OR pcmdline: <proc-name-or-path> OR parent_proc_name: <proc-name> OR cmdline: <domain> OR cmdline: dnslog.cn OR cmdline: curl OR cmdline: wget OR cmdline: nc OR cmdline: bash OR cmdline: sh OR cmdline: python OR cmdline: perl OR cmdline: /tmp) | SELECT proc_start_time, pid, ppid, proc_name, proc_path, username, cmdline, parent_proc_name, pcmdline ORDER BY start_time ASC LIMIT 100' \
  -from '<FROM>' -to '<TO>'
```

5. Hunt for network follow-on, especially public destinations and reverse-shell ports:

```bash
/usr/local/bin/sls -c /root/config/config.yaml -uid <UID> -product sas \
  -query '__topic__: aegis-log-network AND (instance_id: <INSTANCE_ID> OR uuid: <UUID> OR src_ip: <HOST_IP> OR host_ip: <HOST_IP>) | SELECT dst_ip, dst_port, proc_name, proc_path, COUNT(*) AS cnt, MIN(from_unixtime(CAST(start_time AS bigint))) AS first_time, MAX(from_unixtime(CAST(start_time AS bigint))) AS last_time GROUP BY dst_ip, dst_port, proc_name, proc_path ORDER BY cnt DESC LIMIT 50' \
  -from '<FROM>' -to '<TO>'
```

6. Check same-host alert and login context:

```bash
/usr/local/bin/sls -c /root/config/config.yaml -uid <UID> -product sas \
  -query '__topic__: sas-security-log AND (instance_id: <INSTANCE_ID> OR uuid: <UUID> OR intranet_ip: <HOST_IP>) | SELECT from_unixtime(CAST(start_time AS bigint)) AS ts, suspicious_event_id, name, level, status, detail ORDER BY start_time ASC LIMIT 100' \
  -from '<FROM>' -to '<TO>'
```

```bash
/usr/local/bin/sls -c /root/config/config.yaml -uid <UID> -product sas \
  -query '__topic__: aegis-log-login AND (instance_id: <INSTANCE_ID> OR uuid: <UUID> OR src_ip: <HOST_IP> OR host_ip: <HOST_IP>) | SELECT from_unixtime(CAST(start_time AS bigint)) AS ts, login_type, username, src_ip, src_port, dst_ip, dst_port, status, instance_id, host_ip ORDER BY start_time ASC LIMIT 100' \
  -from '<FROM>' -to '<TO>'
```

## Reporting language

Use a balanced conclusion:

- “告警属实：进程 `<proc>` 在 `<time>` 请求了 DNSLog/OOB 域名 `<domain>`。”
- “该行为说明疑似攻击/测试 payload 已进入该进程处理链路并触发 DNS 解析。”
- “当前未发现进一步命令执行/异常登录/反弹连接/落地文件证据” only after checking process, network, login, and related SAS alerts, and state the queried window.
- “建议排查触发进程对应的应用日志、查询日志、调度任务、JDBC/ODBC/HTTP 访问来源，定位 payload 来源。”

For big-data services such as `impalad`, `spark`, `hadoop`, or `java`, specifically ask the customer to review SQL/query history, YARN/Spark application logs, JDBC/ODBC client IPs, and scheduler jobs around the alert time.
