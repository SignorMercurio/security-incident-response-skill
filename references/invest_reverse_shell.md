# 反弹 Shell 调查指南

## 告警特征
- 检测到反向连接行为
- 检测到 bash/sh 进程建立外部连接
- 检测到 nc、socat 等工具的可疑使用

## 调查重点

### 1. 确认反弹 Shell 进程
```bash
# 查找与外部 IP 建立连接的 shell 进程
lsof -i -P -n | grep -E "bash|sh|zsh"
netstat -antup | grep -E "bash|sh"

# 查看进程详情
ps aux | grep <PID>
cat /proc/<PID>/cmdline | tr '\0' ' '
lsof -p <PID>
```

### 2. 分析连接信息
```bash
# 提取远程 IP 和端口
netstat -antup | grep <PID>
ss -antp | grep <PID>

# 查询 IP 归属地（使用 WebSearch）
```

### 3. 追溯触发来源
```bash
# 查看进程树
pstree -ap <PID>
ps -ef --forest | grep <PID>

# 检查父进程
ps -o ppid= <PID>
ps aux | grep <父进程PID>

# 如果父进程是 Web 服务器，检查访问日志
grep "<攻击IP>" /var/log/nginx/access.log | tail -n 50
```

### 4. 检查命令历史
```bash
# 查看当前用户的命令历史
history
cat ~/.bash_history

# 查看所有用户的命令历史
find /home /root -name ".bash_history" -exec grep -H "nc\|bash.*-i\|sh.*-i\|/dev/tcp" {} \;
```

### 5. 搜索反弹 Shell 脚本
```bash
# 查找包含反弹 Shell 代码的脚本
grep -r "bash -i" /tmp /var/tmp /dev/shm 2>/dev/null
grep -r "/dev/tcp" /tmp /var/tmp /dev/shm 2>/dev/null
grep -r "nc.*-e" / 2>/dev/null | head -n 20
```

## 云端日志补充（通过 `sls` skill）

**通过 `Skill` 工具调用 `sls` skill** `-product sas`：
- topic `aegis-log-network` 按 `instance_id` + `dst_ip`/`dst_port` + `proc_name`（`bash`/`sh`/`nc`/`socat`/`python`/`perl` 等）过滤，定位反弹连接和发起进程。
- topic `aegis-log-process` 按 `instance_id` + `parent_proc_name`/`pcmdline` 过滤，还原 shell 进程的父进程（确认是 Web RCE 触发还是登录后手动执行）。
- 域名回连/带 DGA 的配 topic `aegis-log-dns-query`。

需要 UID（自由调查模式没有则向用户索取）。详见 `references/cloud_log_queries.md`。

## 关键 IoC
- 反弹 Shell 目标 IP 和端口
- 反弹 Shell 命令或脚本路径
- 触发反弹 Shell 的漏洞或途径
- 相关进程 PID 和命令行

## ATT&CK 映射
- **T1071** - 应用层协议（命令与控制）
- **T1059.004** - Unix Shell（执行）
- **T1571** - 非标准端口（命令与控制）
