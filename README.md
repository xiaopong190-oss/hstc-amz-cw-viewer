# HSTC_AMZ_CW 只读通道

此仓库只包含观看页面、加密程序和发布流程，不提交明文账本、密码、令牌或本地备份。管理端原私有仓库保持私有。

GitHub Actions 每天一次尝试读取管理端已确认的云端版本，成功后生成 AES-256-GCM 加密快照并发布 Pages。M 码通过 PBKDF2-SHA256（600,000 次，随机盐）派生密钥；每份快照采用随机 IV。浏览器本地解密，观看时 M 码不发给 GitHub。不把明文数据或密码保存在 localStorage。

只读端可筛选交易、分别统计币种、查看商品维度字段和占比。没有上传或删除入口。发布失败会终止部署，旧站点保留；页面显示快照时间和云端版本。GitHub 调度可能延迟，不承诺实时同步。已发布的密文可被下载，访问权限由解密口令保护。更换口令不能收回他人已解密或已下载的数据。

## 配置

1. 仓库 Settings → Pages → Source 选择 GitHub Actions。
2. Actions Secrets 设置 `READONLY_EXPORT_TOKEN`（随机生成的专用只读凭证）、`VIEWER_PASSWORD`（观看 M 码）。不在仓库文件、工作流或命令参数中写入密钥。
3. 手动运行 `Publish encrypted read-only reports`，之后定时自动发布。
4. 在国内实际网络中测试 Pages 地址。能打开 github.com 不等于 github.io 一定可访问。

管理端网址通过工作流 `LEDGER_ORIGIN` 配置。目前为 https://hstc-amz-cw.akolojutet24.chatgpt.site/ 。读取任一批次失败、版本混合、登录失败或云端无已确认数据时，本次不发布空快照。

本地验证：Node.js 24 下运行 `node --test tests/readonly.test.mjs`。构建需要通过环境变量注入密钥，输出到被 Git 忽略的 `readonly/dist/`；只允许上传构建后的 Pages artifact。

只读凭证仅能 GET 已确认的账本和分片；不支持登录、上传、删除、修改。管理端登录 M 码不交给 GitHub。

## V1.02 大屏财务视图

五项 KPI（收入、支出、提现、净利润、账户留存变动）、月/季度/年趋势、支出构成、订单内已扣费用、期间汇总、账号站点汇总，和交易/商品报表一起展示。混合币种使用已保存的管理端汇率折算；单币种保持原币种。缺少汇率时不按 1:1 假算。只读快照新增展示所需的汇率和费用分项，仍不包含密码、导入配置和交易指纹。

V1.04：定时改为每日 UTC 08:17（北京时间 16:17），GitHub 调度可能延迟。展示页的手动拉取入口打开已有 GitHub Actions 页面，由有仓库权限者点击 Run workflow 立即发布。不会把 GitHub 写入令牌放到公开页面；观看者的快照刷新只读。
