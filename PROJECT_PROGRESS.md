# 北科大成绩排名扩展项目进度

## 总目标

制作一个兼容 Chrome、Microsoft Edge 的浏览器扩展，专门用于 `https://byyt.ustb.edu.cn/authentication/main` 进入“个人成绩查询”页面后，解析 `https://byyt.ustb.edu.cn/cjgl/grcjcx/grcjcx` 接口响应，并在成绩表右侧追加两列：

- 排名：来自接口字段 `pm`
- 总人数：来自接口字段 `zrs`

示例：接口数据中存在 `"kcmc": "决策优化分析方法", "pm": "11", "zrs": "79"` 时，该课程所在行显示排名 `11`、总人数 `79`。

## 阶段拆分

### 阶段 1：项目初始化

目标：
- 建立扩展目录结构。
- 编写 Manifest V3 配置。
- 明确仅作用于 `byyt.ustb.edu.cn` 域名。

状态：已完成。

### 阶段 2：接口响应捕获

目标：
- 在页面主执行环境中 hook `fetch` 和 `XMLHttpRequest`。
- 只处理 URL 中包含 `/cjgl/grcjcx/grcjcx` 的响应。
- 兼容接口返回对象、数组、分页包装对象等多种 JSON 结构。

状态：已完成。

### 阶段 3：排名数据归一化

目标：
- 从接口响应中递归提取包含 `kcmc`、`pm`、`zrs` 的记录。
- 以课程名称作为主要匹配键。
- 同步保留课程代码等字段，方便后续扩展匹配策略。

状态：已完成。

### 阶段 4：前端表格列注入

目标：
- 定位包含“课程名称”的成绩表。
- 在表头右侧追加“排名”“总人数”。
- 在每一行右侧追加对应数据。
- 通过克隆原表格单元格保持样式尽量与原列一致。
- 使用 MutationObserver 兼容分页、查询、异步刷新。

状态：已完成。

### 阶段 5：安装与验证

目标：
- 尝试使用 Edge 的 `rbmm8dar` profile 启动浏览器。
- 加载本扩展目录。
- 截图检查扩展是否已安装或已加载。

状态：已完成。

验证结果：
- 已尝试使用 Edge 启动参数 `--profile-directory=rbmm8dar` 加载扩展。
- 本机 Edge 原始用户数据目录中未发现已存在的 `rbmm8dar` profile 目录，因此又使用隔离验证目录 `work/edge-profile-rbmm8dar` 启动 Edge，避免改动真实浏览器资料。
- Edge 扩展管理页已显示“USTB 成绩排名列”。
- 验证截图：`outputs/edge-extension-installed.png`。

### 阶段 6：真实页面调试修正

目标：
- 阅读用户保存的真实页面文件。
- 确认“个人成绩查询”真实 DOM 和业务请求方式。
- 修复旧版扩展未显示新列的问题。

发现：
- 个人成绩页位于主系统页面的同域 iframe 中，iframe 地址为 `https://byyt.ustb.edu.cn/cjgl/grcjcx/go/1`。
- 业务脚本 `querygrcjcx-*.js` 使用 jQuery `$.ajax` POST 到 `baseUrl + 'cjgl/grcjcx/grcjcx'`。
- 接口成功后使用 `data.content.list` 作为 Vue/iView 表格数据。
- 成绩表是 iView 分离表格结构：`.ivu-table-header table` 和 `.ivu-table-body table` 分开渲染。
- 旧版表格定位主要覆盖 Element UI/普通 table，未稳定覆盖 iView 分离表格。
- 旧版还存在一次空渲染后标记完成，接口数据返回时可能不再回填的时序问题。

修复：
- Manifest 版本升级到 `1.0.2`。
- 使用 `all_frames: true` 覆盖 iframe。
- `page-hook.js` 通过 Manifest V3 `world: "MAIN"` 在页面主环境注入。
- `content-script.js` 适配 `.ivu-table-wrapper`，同时修改表头、表体和 `colgroup`。
- 匹配策略改为优先“课程代码 + 课程名称”，再回退课程代码或课程名称。
- 渲染逻辑改为可重复更新，接口数据返回后能回填已有空列。

验证：
- 已使用 Playwright + Edge 加载扩展，模拟 `https://byyt.ustb.edu.cn/cjgl/grcjcx/go/1` 的 iView 表格结构。
- 已模拟 `https://byyt.ustb.edu.cn/cjgl/grcjcx/grcjcx` 返回 `data.content.list`。
- 验证结果：表头追加“排名”“总人数”，课程“决策优化分析方法”行末显示 `11` 和 `79`。
- 验证截图：`C:\Users\31248\Documents\Codex\2026-07-04\zai\outputs\ustb-rank-debug-iview-test-v102.png`。

## 当前交付物

- `manifest.json`：Chrome/Edge Manifest V3 配置。
- `content-script.js`：内容脚本，负责注入 hook、接收数据、修改表格。
- `page-hook.js`：页面主环境 hook 脚本，负责捕获接口响应。
- `README.md`：安装、使用、调试说明。
