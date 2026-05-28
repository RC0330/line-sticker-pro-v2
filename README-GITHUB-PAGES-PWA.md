# LINE Sticker PRO - GitHub Pages + PWA 部署說明

這個版本已設定為可部署到 GitHub Pages，並可在手機瀏覽器「加入主畫面」當作 PWA 使用。

## 1. 建立 GitHub Repository

1. 登入 GitHub。
2. 建立新的 repository，例如：`line-sticker-pro`。
3. 建議選擇 Public；Private 也可以，但 GitHub Pages 權限可能依帳號方案不同。

## 2. 上傳專案

把本 ZIP 解壓縮後，進入專案資料夾，確認可以看到：

- `package.json`
- `vite.config.js`
- `src/`
- `public/`
- `.github/workflows/deploy-github-pages.yml`

然後上傳到 GitHub。

### 方法 A：GitHub 網頁上傳

1. 進入 repository。
2. 點 `Add file` → `Upload files`。
3. 拖曳專案資料夾內的所有檔案與資料夾。
4. Commit 到 `main` branch。

### 方法 B：使用 Git 指令

```bash
git init
git add .
git commit -m "Deploy LINE Sticker PRO PWA"
git branch -M main
git remote add origin https://github.com/你的帳號/line-sticker-pro.git
git push -u origin main
```

## 3. 開啟 GitHub Pages

1. 進入 repository 的 `Settings`。
2. 左側選 `Pages`。
3. `Build and deployment` → `Source` 選 `GitHub Actions`。
4. 回到 `Actions` 頁面，等待 `Deploy PWA to GitHub Pages` 完成。

完成後網址通常會是：

```text
https://你的帳號.github.io/line-sticker-pro/
```

## 4. 手機加入主畫面

### iPhone / iPad

1. 用 Safari 開啟 GitHub Pages 網址。
2. 點下方分享按鈕。
3. 選「加入主畫面」。
4. 之後從桌面圖示開啟。

### Android

1. 用 Chrome 開啟 GitHub Pages 網址。
2. 點右上角 `⋮`。
3. 選「安裝應用程式」或「加入主畫面」。
4. 之後從桌面圖示開啟。

## 5. 離線使用注意

第一次開啟時需要網路。成功載入後，PWA 會快取主要檔案；之後即使電腦未開機，也可以從手機主畫面開啟。若清除瀏覽器資料或 GitHub Pages 網址變更，需要重新連網載入一次。

## 6. 本機測試

```bash
npm install
npm run dev
```

正式部署前可測試 build：

```bash
npm run build
npm run preview
```


## v7 手機圖片縮放更新

- 手機上傳圖片後會自動「適合螢幕」。
- 可用雙指縮放圖片、雙指拖動畫布，方便放大細節後精準裁切。
- 工具列新增「＋放大 / －縮小 / 適合螢幕 / 100% 原始大小」。
- 電腦可用滑鼠滾輪縮放。
- 縮放只影響編輯視圖，不會改變實際裁切座標或 PNG 透明輸出品質。
