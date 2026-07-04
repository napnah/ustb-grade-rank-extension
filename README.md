# USTB 成绩排名列浏览器扩展

这个扩展用于北科大本研一体化教务系统个人成绩查询页面。它会监听 `https://byyt.ustb.edu.cn/cjgl/grcjcx/grcjcx` 接口响应，读取每门课的 `kcmc`、`pm`、`zrs` 字段，并在成绩表右侧追加“排名”“总人数”两列。

## 安装

Chrome 或 Microsoft Edge 均可使用：

1. 打开扩展管理页。
   - Edge：`edge://extensions/`
   - Chrome：`chrome://extensions/`
2. 开启“开发人员模式”。
3. 点击“加载解压缩的扩展”。
4. 选择本目录：`ustb-grade-rank-extension`。

已安装过旧版本时，请在扩展管理页点击“重新加载”，或者先删除旧扩展后重新加载本目录。

## 使用

1. 登录 `https://byyt.ustb.edu.cn/authentication/main`。
2. 打开“个人成绩查询”。
3. 等待成绩表加载完成。
4. 表格右侧会出现“排名”“总人数”两列。

## 工作方式

- `page-hook.js` 注入到页面环境，hook `fetch` 和 `XMLHttpRequest`。
- `content-script.js` 接收接口响应，递归查找包含 `kcmc` 和 `pm/zrs` 的数据项。
- 课程行优先通过“课程代码 + 课程名称”匹配接口中的 `kcdm/kcmc`，然后回退到课程代码或课程名称。
- 成绩页实际运行在同域 iframe 中，扩展已开启 `all_frames`。
- 成绩表实际是 iView 的分离表格结构，表头和表体是两张 table；扩展会同时修改表头、表体和 `colgroup` 宽度。
- 表格列通过克隆原表格最后一列生成，以尽量保持样式一致。

## 本次调试结论

未显示新列的主要原因是旧版只重点适配了 Element UI 和普通 table，没有准确适配保存页面中的 iView 表格结构。真实页面中“个人成绩查询”位于 `cjgl/grcjcx/go/1` iframe 内，成绩表 DOM 为 `.ivu-table-wrapper`，表头 `.ivu-table-header table` 和表体 `.ivu-table-body table` 分离。

当前版本已修正：

- `page-hook.js` 通过 Manifest V3 `world: "MAIN"` 在主页面环境更早注入。
- `content-script.js` 适配 iView 分离表格。
- 修复了“空列先渲染后，接口数据返回时不回填”的时序问题。
- 自动化复现已验证课程“决策优化分析方法”显示排名 `11`、总人数 `79`。

## 注意

- 扩展不会保存账号、密码、Cookie 或成绩数据。
- 如果页面结构更新，可能需要调整 `content-script.js` 中的表格定位逻辑。
- 若接口未返回 `pm` 或 `zrs`，对应单元格会保持为空。
