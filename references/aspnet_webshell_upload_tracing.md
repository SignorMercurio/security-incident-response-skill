# ASP.NET / IIS WebShell upload tracing notes

Use when investigating Windows/IIS ASP.NET WebShell files such as `.ashx`, `.aspx`, upload directories, or paths like `E:/website/uploadfiles/YYYYMMDD/...`.

## Filename timestamp clue

Some ASP.NET upload filenames embed .NET ticks. Example:

`6381260884112725008809000.ashx`

The prefix `638126088411272500` can be parsed as .NET ticks (100ns since 0001-01-01):

```bash
python3 - <<'PY'
from datetime import datetime, timedelta
s='638126088411272500'
print((datetime(1,1,1)+timedelta(microseconds=int(s)/10)).strftime('%Y-%m-%d %H:%M:%S'))
PY
```

This yields `2023-02-21 20:40:41`, which matched SAS `fileModifyTime` / `fileCreateTime` in the observed case. Treat it as a strong time-window hint, not proof of upload source.

## SLS triage pattern

1. Query SAS for the exact path/name/hash to extract asset info, first/last found, file times, UUID, instance ID, and public/private IPs.
2. Query WAF around the inferred upload time and around SAS `firstFound`:
   - exact filename
   - directory (`UploadFiles/YYYYMMDD/`, case variants)
   - `POST` requests to upload handlers or nearby application paths
3. If old WAF/SAS logs are empty, clearly state that original source IP cannot be proven from SLS retention.
4. Check recent WAF hits to the WebShell directory separately; label them as later access/probing only unless they coincide with file creation/upload.

## IIS host follow-up

When SLS cannot prove the upload source, request/read IIS logs from the victim host and search the narrow window around file creation:

- `POST`
- exact filename or tick prefix
- upload directory/date folder
- upload endpoint keywords: `upload`, `UploadFiles`, `file`, `.ashx`, `.aspx`

For a file time of `2023-02-21 20:40:41`, search at least `20:35:00 ~ 20:45:00`, expanding if no hit.

## Reporting pitfall

Do not identify a later GET to the directory as the uploader. Say: “该 IP 仅证明近期访问/探测该目录，不能证明其为原始上传源 IP。”
