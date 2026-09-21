# 鹦鹉养殖场管理系统（parrot-farm-manager）

手机 / 平板优先的养殖场内部管理系统。

- 前端：静态 Web（原生 JS + Supabase JS SDK），部署于 GitHub Pages
- 后端：Supabase（PostgreSQL + Auth + RLS）
- 公开访问：https://gitunclefat.github.io/parrot-farm-manager/（登录后使用）

## 目录结构

```
index.html            应用入口（登录 + 主框架）
assets/css/style.css  样式
assets/js/app.js      前端逻辑
sql/schema.sql        数据库表结构（在 Supabase SQL Editor 执行）
PRD.md / 开发计划.md   需求与开发文档
```

## 本地开发

直接用浏览器打开 index.html 即可（Supabase 已开放跨域）。
