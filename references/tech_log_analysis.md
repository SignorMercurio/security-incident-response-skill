# 日志定位与分析技巧

## Web 日志定位的多种思路

当需要定位主机侧 Web 日志时，按以下顺序尝试：

### 思路 1: 从告警详情提取信息
```bash
# 从 Webshell 路径提取工作目录
# 例如：/var/www/html/upload/shell.php -> /var/www/html

# 从 Java 进程命令行提取工作目录
ps aux | grep java
# 查看完整命令行参数中的 -Dcatalina.base 等
```

### 思路 2: 定位提供 Web 服务的进程
```bash
# 方法 2.1: 检查进程列表
ps aux | grep -E "nginx|apache|httpd|java|node|tomcat"

# 方法 2.2: 通过监听端口定位进程
ss -tlnp | grep -E ":80|:443|:8080"
netstat -tlnp | grep -E ":80|:443|:8080"
lsof -i :80

# 定位到进程后，检查工作目录
ls -la /proc/<PID>/cwd
ls -la /proc/<PID>/exe
cat /proc/<PID>/cmdline | tr '\0' ' '
```

### 思路 3: 检查中间件配置
```bash
# Nginx
which nginx
# 常见安装目录：/usr/sbin/nginx, /usr/local/nginx/sbin/nginx
# 配置文件位置
cat /etc/nginx/nginx.conf | grep access_log
cat /usr/local/nginx/conf/nginx.conf | grep access_log

# Apache
which apache2 / which httpd
cat /etc/apache2/apache2.conf | grep CustomLog
cat /etc/httpd/conf/httpd.conf | grep CustomLog

# Tomcat
# 检查 CATALINA_HOME 环境变量
# 日志通常在 $CATALINA_HOME/logs/
find /opt /usr/local -name "catalina.out" -o -name "localhost_access_log*"
```

### 思路 4: 按时间搜索日志文件
```bash
# 查找最近修改的 .log 文件
find /var/log /opt /usr/local -name "*.log" -mtime -1 -ls

# 可能遗漏无后缀的日志文件，进一步检查
find /var/log /opt /usr/local -type f -mtime -1 | xargs file | grep text
```

### 思路 5: 容器环境特殊处理
```bash
# 列出所有容器
docker ps -a
crictl ps -a

# 查看容器日志（Web 日志可能打印到标准输出）
docker logs <container_id> | tail -n 100
crictl logs <container_id> | tail -n 100

# 根据告警信息提取关键字匹配容器名
docker ps | grep -i <关键字>

# 从进程链提取容器 ID
# 进程链中通常会包含容器 ID 的前缀
```

### 思路 6: 应用日志作为替代
```bash
# 即使没有 Web 日志，应用日志也可能包含关键证据
# 常见位置
ls -la /var/log/<应用名>/
ls -la /opt/<应用名>/logs/
find / -type d -name "logs" 2>/dev/null

# 在应用日志中搜索关键词
grep -r "ERROR\|Exception\|eval\|exec\|Runtime" /path/to/app/logs/ | tail -n 50
```

---

## 基于告警时间过滤日志

**核心思路**：告警时间是最可靠的线索，围绕告警时间前后几秒的日志进行分析。

```bash
# 示例：告警时间为 2024-05-27 18:35:07
# 查询 18:35:05 ~ 18:35:09 之间的日志

# 方法 1: grep 时间字符串
grep "2024-05-27 18:35:0[5-9]" /var/log/nginx/access.log
grep "27/May/2024:18:35:0[5-9]" /var/log/nginx/access.log

# 方法 2: awk 按时间范围过滤
awk '/27\/May\/2024:18:35:0[5-9]/' /var/log/nginx/access.log

# 方法 3: sed 提取时间范围
sed -n '/2024-05-27 18:35:05/,/2024-05-27 18:35:09/p' /var/log/app.log
```

**应用场景**：Web 日志、应用日志、WAF 日志、系统日志 (/var/log/messages, /var/log/syslog)、云助手命令日志

---

## 多次告警取交集定位关键请求

**核心思路**：攻击请求往往不止出现一次。每次告警触发时间都应该有对应的攻击请求，取交集可以大幅缩小排查范围。

**操作步骤**：
1. 列出所有告警触发时间
2. 针对每个时间点，提取该时间前后 2 秒内的所有请求 URL
3. 找出在所有时间点都出现的 URL（交集）
4. 交集中的 URL 即为可疑的攻击请求

**示例**：

假设有 6 个告警时间点：18:18:12, 18:23:44, 18:31:01, 18:36:15, 18:36:25, 18:48:27

```bash
# 提取每个时间点的请求 URL
grep "18:18:1[1-3]" access.log | awk '{print $7}' | sort -u > urls_1.txt
grep "18:23:4[3-5]" access.log | awk '{print $7}' | sort -u > urls_2.txt
grep "18:31:0[0-2]" access.log | awk '{print $7}' | sort -u > urls_3.txt
grep "18:36:1[4-6]" access.log | awk '{print $7}' | sort -u > urls_4.txt
grep "18:36:2[4-6]" access.log | awk '{print $7}' | sort -u > urls_5.txt
grep "18:48:2[5-7]" access.log | awk '{print $7}' | sort -u > urls_6.txt

# 取交集
cat urls_*.txt | sort | uniq -c | awk '$1 == 6 {print $2}'
```

**优势**：告警次数越多效果越好，可以直接排除大量正常请求，通常能将可疑请求范围缩小到 1-3 个。

---

## WAF 日志高级分析技巧

> 查 WAF 原始日志**通过 `sls` skill**（`-product waf`，metadata 模式）—— 调用方式和「什么攻击类型该查 WAF」见 `references/cloud_log_queries.md`。`sls` skill 还自带 `references/waf-ddos-and-test-mode-interpretation.md`（核心规则测试模式 vs 实际拦截、高防/DDoS 措辞坑）和 `references/waf-cc-internal-rule-recompute.md`（内置 CC 规则命中重算）。本节是拿到 WAF 日志之后的字段分析与会话关联技巧。

### 快捷视图分析分布特征
SLS 查询界面左侧的快捷视图可以快速查看字段分布：
- `request_path` - 查看访问最多的路径
- `status` - 查看状态码分布
- `request_length` - 查看请求长度分布（异常大的请求值得关注）
- `real_client_ip` - 查看访问来源 IP 分布

### 信息聚合分析
```sql
-- 统计每个路径的访问次数
| SELECT request_path, COUNT(*) cnt GROUP BY request_path ORDER BY cnt DESC

-- 统计每个 IP 的访问次数
| SELECT real_client_ip, COUNT(*) cnt GROUP BY real_client_ip ORDER BY cnt DESC

-- 统计每个 IP 访问的不同路径数量
| SELECT real_client_ip, COUNT(DISTINCT request_path) path_cnt
  GROUP BY real_client_ip ORDER BY path_cnt DESC

-- 找出大量 POST 请求的 IP
request_method: POST | SELECT real_client_ip, COUNT(*) cnt
GROUP BY real_client_ip ORDER BY cnt DESC LIMIT 10
```

### 基于会话反向匹配

**场景**：已知攻击 IP，想找出攻击者的所有请求（包括更换 IP 前的请求）

**原理**：利用会话 ID（Cookie）的唯一性

```sql
-- Step 1: 提取攻击 IP 的所有会话 ID
real_client_ip: '<攻击 IP>'
| SELECT DISTINCT regexp_extract(http_cookie, 'acw_tc=([^;]+)', 1) AS acw_tc

-- Step 2: 使用会话 ID 反查所有请求
http_cookie: "<会话ID1>" OR http_cookie: "<会话ID2>"
```

**常见会话标识字段**：acw_tc (WAF)、aliyungf_tc (阿里云)、PHPSESSID (PHP)、JSESSIONID (Java)、ASP.NET_SessionId (.NET)

---

## 时区注意事项

**问题**：日志时区与告警时区不一致导致时间比对错误。

**识别方法**：
```bash
# UTC+8 时区标识
[02/Jan/2006:15:04:05 +0800]
2006-01-02T15:04:05+08:00

# UTC+0 时区标识
[02/Jan/2006:15:04:05 +0000]
2006-01-02T15:04:05Z  # ISO 8601 标准，Z 表示 UTC+0
```

**转换方法**：UTC+0 转 UTC+8：时间 + 8 小时；UTC+8 转 UTC+0：时间 - 8 小时

**检查系统时区**：
```bash
timedatectl
cat /etc/timezone
date +%Z
```

---

## 攻击源 IP 追溯

**问题**：应用日志中记录的 IP 是反向代理 IP，而非真实攻击源。

**常见反向代理架构**：
```
真实攻击者 -> WAF -> SLB -> Nginx -> 应用服务器
```

在这种架构下：
- 应用服务器日志看到的是 Nginx IP
- Nginx 日志看到的是 SLB IP
- WAF 日志看到的才是真实攻击者 IP

**检查方法**：
```bash
# 查看应用是否从 HTTP Header 中获取了真实 IP
# 常见 Header: X-Forwarded-For, X-Real-IP
grep -i "x-forwarded-for\|x-real-ip" /path/to/app/config
```
