# 遗留风险排查 — 可疑项的下一步

SKILL.md 步骤 6 的 6 个并行维度由 agent 自行生成只读命令。任一组返回可疑项时，按下表启动深入排查：

| 可疑发现 | 下一步 |
|---|---|
| 新增 UID < 1000 的账户，或 root 同 UID 的别名账户 | 查该账户的登录历史（`last -F <user>`）+ sudo 日志（`/var/log/auth.log` / `/var/log/secure`） |
| `/etc/ld.so.preload` 非空，或 `LD_PRELOAD` 出现在 profile/bashrc | 立即检查所指共享库的路径、属主、创建时间和 `md5sum`/`sha256sum`，做 VirusTotal 比对 |
| 异常 systemd unit（最近 30 天落地，或属主非 root，或 `ExecStart` 指向 `/tmp`/`/home`） | 看 `ExecStart`、`User=`、`WorkingDirectory=`、unit 文件落地时间；交叉验证启动日志 `journalctl -u <unit>` |
| `rpm -Va` / `dpkg -V` 标关键二进制被改（`/bin/ps`, `/bin/ls`, `/usr/bin/find`, `/usr/sbin/sshd`, `/bin/netstat`） | 高度怀疑 rootkit 或命令替换 → **Read `references/tech_attack_countermeasures.md`** 转入反制 |
| `authorized_keys` 出现非预期公钥，或 `sudoers.d/` 出现非预期文件 | 提取公钥指纹和 sudoer 规则；查该文件落地时间和 `last` 登录记录交叉 |
| `/var/log/aliyun/assist/` 近期出现非预期 RunCommand task（攻击窗口内执行、命令含外网下载/改 cron/改 sshd_config 等） | 提取 task id、命令、时间戳；交叉 ActionTrail 中对应 `RunCommand`/`InvokeCommand`/`CreateCommand` 的 `sourceIpAddress` 和 `userIdentity` 定位泄露 AK → Read `references/tech_cloud.md` |
