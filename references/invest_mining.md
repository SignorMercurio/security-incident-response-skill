# 挖矿木马调查指南

## 告警特征
- 检测到挖矿进程或挖矿池连接
- CPU/GPU 使用率异常高
- 检测到已知的挖矿木马样本

## 调查重点

### 1. 确认挖矿进程
```bash
# 查看高 CPU 进程
top -b -n 1 | head -n 20
ps aux --sort=-%cpu | head -n 10

# 查看进程详细信息
ps -ef | grep <挖矿进程名>
cat /proc/<PID>/cmdline | tr '\0' ' '
ls -la /proc/<PID>/exe
```

### 2. 分析挖矿程序
```bash
# 查找挖矿程序文件
ls -la /proc/<PID>/exe
readlink /proc/<PID>/exe

# 计算文件哈希
md5sum <挖矿程序路径>
sha256sum <挖矿程序路径>

# 查看文件创建时间
stat <挖矿程序路径>
```

### 3. 检查网络连接
```bash
# 查看挖矿进程的网络连接
lsof -i -P -n | grep <PID>
netstat -antup | grep <PID>
ss -antp | grep <PID>

# 提取矿池地址和端口
```

### 4. 追溯入侵源头
```bash
# 查看进程的父进程
ps -ef --forest | grep <挖矿进程名>
pstree -ap <PID>

# 检查是否通过 cron 启动
crontab -l
cat /var/spool/cron/*
ls -la /etc/cron.*

# 检查是否通过 systemd 服务启动
systemctl list-units --type=service | grep -i mining
ls -la /etc/systemd/system/

# 检查启动脚本
cat /etc/rc.local
ls -la /etc/init.d/
```

### 5. 检查持久化机制
```bash
# 检查启动项
cat ~/.bashrc
cat ~/.bash_profile
cat /etc/profile
cat /etc/bash.bashrc

# 查找定时下载脚本
find /tmp /var/tmp /dev/shm -type f -name "*.sh" -mtime -7
```

### 6. 搜索相关恶意文件
```bash
# 按时间查找可疑文件
find / -type f -newermt "<入侵时间>" ! -newermt "<当前时间>" 2>/dev/null | grep -E "(tmp|var/tmp|dev/shm)"

# 查找可疑的下载脚本
find / -type f -name "*.sh" -o -name "*.py" | xargs grep -l "curl\|wget" 2>/dev/null
```

## 云端日志补充（通过 `sls` skill）

主机侧进程可能被隐藏/命令替换，云安全中心遥测能旁证。**通过 `Skill` 工具调用 `sls` skill** `-product sas`：
- topic `aegis-log-process` 按 `instance_id` + `proc_name`/`proc_path`/`cmdline`/`parent_proc_name` 过滤，还原挖矿进程的启动链和父进程（确认是 cron / Web / 登录后拉起）。
- topic `aegis-log-network` 按 `instance_id` + `dst_ip`/`dst_port` 过滤，查矿池连接。
- 时间字段是字符串：用 `from_unixtime(CAST(start_time AS bigint))`；`proc_start_time` 先过滤 `N/A` 和空值。

需要 UID（自由调查模式没有则向用户索取）。详见 `references/cloud_log_queries.md`。

## 关键 IoC
- 挖矿程序路径和哈希
- 矿池地址和端口
- 挖矿进程名
- 下载源 URL
- 持久化机制配置文件路径

## ATT&CK 映射
- **T1496** - 资源劫持（影响）
- **T1053.003** - Cron（持久化）
- **T1543.002** - Systemd 服务（持久化）
- **T1071.001** - Web 协议（命令与控制，如果有）
