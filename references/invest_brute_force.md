# 暴力破解调查指南

## 告警特征
- 检测到大量登录失败尝试
- 短时间内多次密码错误
- 来自单一 IP 的密码猜测

## 调查重点

### 1. 确认攻击源
```bash
# 查看失败登录记录
lastb | head -n 50
lastb | grep "<攻击IP>"

# 统计失败登录次数
lastb | awk '{print $3}' | sort | uniq -c | sort -rn | head -n 20

# 查看认证日志
grep "Failed password" /var/log/auth.log | tail -n 100
grep "authentication failure" /var/log/secure | tail -n 100
```

### 2. 分析攻击模式
```bash
# 按时间段统计失败登录
grep "Failed password" /var/log/auth.log | grep "<日期>" | wc -l

# 查看尝试的用户名
grep "Failed password" /var/log/auth.log | awk '{print $(NF-5)}' | sort | uniq -c | sort -rn

# 查看攻击的目标用户
grep "Failed password for" /var/log/auth.log | grep "<攻击IP>"
```

### 3. 检查是否成功登录
```bash
# 查看成功登录记录
last | grep "<攻击IP>"
grep "Accepted password" /var/log/auth.log | grep "<攻击IP>"

# 如果成功登录，查看登录后的活动
grep "<攻击IP>" /var/log/auth.log | grep -A 20 "Accepted"
```

### 4. 检查防护措施
```bash
# 查看 fail2ban 状态
fail2ban-client status
fail2ban-client status sshd

# 查看防火墙规则
iptables -L -n -v | grep "<攻击IP>"
```

## 云端日志补充（通过 `sls` skill）

主机 `lastb`/`auth.log` 可能被清除或不含 RDP/数据库登录。**通过 `Skill` 工具调用 `sls` skill** `-product sas`：
- topic `aegis-log-login` 按 `instance_id`/`src_ip`/`host_ip` 过滤，统计失败/成功登录，找暴破源 IP 和「失败→成功」的转折点（确认是否破解成功）。
- topic `sas-security-log` 查云安全中心暴力破解/异常登录告警。

需要 UID（自由调查模式没有则向用户索取）。详见 `references/cloud_log_queries.md`。

## 关键 IoC
- 攻击源 IP 地址
- 攻击时间段
- 尝试的用户名列表
- 是否成功登录

## ATT&CK 映射
- **T1110.001** - 密码猜测（凭证访问）
- **T1110.003** - 密码喷洒（凭证访问）
- **T1021.004** - SSH（横向移动，如果成功）
