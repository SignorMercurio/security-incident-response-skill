# SQL 注入调查指南

## 告警特征
- 检测到 SQL 注入攻击
- 检测到异常的数据库查询
- WAF 拦截了 SQL 注入尝试

## 调查重点

### 1. 确认攻击源和目标
```bash
# 查看 Web 访问日志中的 SQL 注入尝试
grep -E "union.*select|' or |' and |--|\#|/\*" /var/log/nginx/access.log | tail -n 50

# 提取攻击 IP
grep -E "union.*select" /var/log/nginx/access.log | awk '{print $1}' | sort -u
```

### 2. 分析注入点
```bash
# 查找被攻击的页面
grep -E "union.*select" /var/log/nginx/access.log | awk '{print $7}' | sort -u

# 查看完整的注入请求
grep "<攻击IP>" /var/log/nginx/access.log | grep -E "union|select"
```

### 3. 检查数据库日志
```bash
# MySQL 慢查询日志
cat /var/log/mysql/slow-query.log

# MySQL 错误日志
tail -n 100 /var/log/mysql/error.log

# PostgreSQL 日志
tail -n 100 /var/log/postgresql/postgresql-*.log
```

### 4. 评估影响
```bash
# 检查是否有数据被导出
grep -E "into outfile|into dumpfile" /var/log/nginx/access.log

# 检查是否有 Web Shell 写入
find /var/www -type f -newermt "<攻击时间>" -ls
```

### 5. 检查代码漏洞
```bash
# 查找可能存在注入的代码文件
grep -r "SELECT.*\$_GET\|SELECT.*\$_POST" /var/www --include="*.php"
```

## 云端日志补充（通过 `sls` skill）

主机 `access.log` 常被清除/轮转，WAF 日志里才是攻击者真实 IP。**通过 `Skill` 工具调用 `sls` skill**：`-product waf` 按 `host` + `request_path`/`request_uri` + `real_client_ip` + `final_rule_id`/`final_action` + `time` 过滤，定位注入请求、注入点 URL 和真实攻击 IP（注意 `waf_test`/`final_action`「测试模式 ≠ 实际拦截」）。若数据库审计日志投递到了 SLS，可用 direct 模式直连对应 logstore 查异常查询。需要 UID（自由调查模式没有则向用户索取）。详见 `references/cloud_log_queries.md`。

## 关键 IoC
- 攻击源 IP
- 注入点 URL
- 注入 payload
- 受影响的数据库和表

## ATT&CK 映射
- **T1190** - 利用面向公众的应用程序
- **T1505.003** - Web Shell（如果植入了 Web Shell）
