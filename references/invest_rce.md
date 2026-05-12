# 远程代码执行 (RCE) 调查指南

## 告警特征
- 检测到远程代码执行攻击
- 检测到命令注入
- 检测到反序列化漏洞利用

## 调查重点

### 1. 确认漏洞利用
```bash
# 查看 Web 访问日志中的命令注入尝试
grep -E "system\(|exec\(|passthru\(|shell_exec\(|`|%00" /var/log/nginx/access.log | tail -n 50

# 查看可疑的 POST 请求
grep "POST" /var/log/nginx/access.log | grep "<攻击IP>"
```

### 2. 分析执行的命令
```bash
# 查看 Web 服务器进程的子进程
pstree -ap | grep -A 10 "nginx\|apache\|httpd"

# 查看 www-data 用户的进程
ps aux | grep www-data
```

### 3. 检查命令执行痕迹
```bash
# 查看 Web 用户的命令历史（如果有）
cat /var/www/.bash_history

# 查看系统日志中的进程启动记录
journalctl -u nginx -n 100
```

### 4. 追溯漏洞代码
```bash
# 查找可能存在 RCE 的代码
grep -r "system\|exec\|passthru\|shell_exec\|eval" /var/www --include="*.php" --include="*.jsp"
```

### 5. 检查后续行为
```bash
# 查看是否下载了其他恶意文件
find /tmp /var/tmp -type f -newermt "<攻击时间>" -ls

# 查看是否建立了反向连接
lsof -i -P -n | grep www-data
```

## 云端日志补充（通过 `sls` skill）

**通过 `Skill` 工具调用 `sls` skill**：
- `-product waf` 按 `host` + `request_path`/`request_uri` + `real_client_ip` + `time` 过滤，定位利用请求和真实攻击 IP（注意 `waf_test`/`final_action`「测试模式 ≠ 实际拦截」）。
- `-product sas` topic `aegis-log-process` 按 `instance_id` + `parent_proc_name`/`pcmdline`（含 web 进程名如 `java`/`php-fpm`/`nginx`/`w3wp.exe`）过滤，还原命令执行链和父进程；`aegis-log-network` 查 RCE 后续的外联/下载。

需要 UID（自由调查模式没有则向用户索取）。详见 `references/cloud_log_queries.md`。

## 关键 IoC
- 攻击源 IP
- 漏洞利用 URL 和 payload
- 执行的命令
- 下载的恶意文件

## ATT&CK 映射
- **T1190** - 利用面向公众的应用程序
- **T1059** - 命令和脚本解释器
- **T1105** - 远程文件复制（如果有下载行为）
