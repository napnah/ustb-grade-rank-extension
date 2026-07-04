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

首页“常用查询及办理”的成绩表也会自动显示排名和总人数。

## 工作方式

- `page-hook.js` 注入到页面环境，hook `fetch` 和 `XMLHttpRequest`。
- `content-script.js` 接收接口响应，递归查找包含 `kcmc` 和 `pm/zrs` 的数据项。
- 支持个人成绩查询接口 `/cjgl/grcjcx/grcjcx` 和首页成绩接口 `/cjgl/yjsxxjd/cjcx`。
- 课程行优先通过“课程代码 + 课程名称”匹配接口中的 `kcdm/kcmc`，然后回退到课程代码或课程名称。
- 成绩页实际运行在同域 iframe 中，扩展已开启 `all_frames`。
- 成绩表的表头和表体会同时追加列，并自动按页面宽度重新分配每列宽度。
- 表格列通过克隆原表格最后一列生成，以尽量保持样式一致。

## 注意

- 扩展不会保存账号、密码、Cookie 或成绩数据。
- 如果页面结构更新，可能需要调整 `content-script.js` 中的表格定位逻辑。
- 若接口未返回 `pm` 或 `zrs`，对应单元格会保持为空。
