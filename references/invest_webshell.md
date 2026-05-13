# Web Shell 后门调查指南

## 告警特征
- 检测到可疑的脚本文件（.php, .jsp, .asp, .aspx 等）
- Web 目录下出现异常文件
- 检测到 Web Shell 通信行为

## 调查重点

### 1. 确认 Web Shell 文件
```bash
# 查看文件内容
cat /var/www/html/suspicious.php

# 查看文件元数据
stat /var/www/html/suspicious.php
ls -la /var/www/html/suspicious.php

# 计算文件哈希
md5sum /var/www/html/suspicious.php
sha256sum /var/www/html/suspicious.php
```

### 2. 分析上传时间和方式
```bash
# 查找同一时间段创建的其他文件
find /var/www -type f -newermt "2024-01-01 10:00" ! -newermt "2024-01-01 11:00" -ls

# 检查 Web 服务器访问日志（根据告警时间调整）
# Nginx
grep "suspicious.php" /var/log/nginx/access.log
grep "POST.*\.php" /var/log/nginx/access.log | grep "<上传时间段>"

# Apache
grep "suspicious.php" /var/log/apache2/access.log
grep "POST" /var/log/httpd/access_log | grep "<时间段>"
```

### 3. 追踪利用的漏洞
```bash
# 查找文件上传相关的 POST 请求
grep "POST.*upload" /var/log/nginx/access.log | grep "<攻击IP>"

# 查找可能的漏洞利用特征
grep -E "(eval|system|exec|shell_exec|passthru)" /var/log/nginx/access.log
```

### 4. 检查 Web Shell 的使用记录
```bash
# 查找访问 Web Shell 的请求
grep "suspicious.php" /var/log/nginx/access.log | tail -n 100

# 分析执行的命令（从访问日志或 Web Shell 日志中）
grep "cmd=" /var/log/nginx/access.log
```

### 5. 排查相关进程
```bash
# 查找可能由 Web Shell 启动的进程
ps aux | grep www-data
lsof -u www-data

# 查看 Web 服务器进程的子进程
pstree -ap | grep -A 10 "nginx\|apache\|httpd"
```

## 判读注意事项

- 不要把可疑文件的 `atime` 自动判定为攻击者访问时间；云安全中心/SAS 扫描读取也会刷新访问时间。必须用 Web 访问日志、SAS 进程/网络遥测或 WAF 日志交叉验证。
- 若 nginx/Apache 日志中告警文件 0 命中，而文件 `atime` 与告警时间接近，应明确写成"告警扫描触发/文件存在告警"，不要写成"攻击者在该时间调用 WebShell"。
- WebShell 文件当前存在不等于当前可利用：检查 nginx/PHP 配置（例如 `location ~ \.php$ { return 403; }`、仅放行 `/index.php`）并实际核对访问日志状态码。
- 发现一个 WebShell 时，扩展排查同目录同时间段批量落地的文件、压缩包和数据库探测脚本（常见：`shell*.php`、`s.php`、`mysql.php`、`db_*.php`、`dump*.php`、`rd*.php`、`rde*.php`、`arc.tar.gz`），并检查硬编码数据库凭据与数据导出风险。

## 云端日志补充（通过 `sls` skill）

WAF 日志里才是攻击者真实 IP（不是 SLB/Nginx 后的内网 IP），且主机 `access.log` 常被清除/轮转丢失。**通过 `Skill` 工具调用 `sls` skill**：`-product waf` 按 `host` + `request_path`/`request_uri`（WebShell 路径、上传接口）+ `real_client_ip` + `final_action`/`final_rule_id` + `time` 过滤，定位上传请求、利用请求和真实攻击 IP（解读时注意 `waf_test`/`final_action`「测试模式 ≠ 实际拦截」）；再用 `-product sas` topic `aegis-log-process`（按 web 用户/`instance_id` 过滤）还原 WebShell 拉起的子进程链。需要 UID（自由调查模式没有则向用户索取）。详见 `references/cloud_log_queries.md`。

## 关键 IoC
- Web Shell 文件路径和哈希
- 攻击者 IP 地址
- 上传时间和方式
- 利用的漏洞（CVE 编号）
- 执行的命令记录

## ATT&CK 映射
- **T1190** - 利用面向公众的应用程序（初始访问）
- **T1505.003** - Web Shell（持久化）
- **T1059.004** - Unix Shell（执行）
- **T1071.001** - Web 协议（命令与控制）
