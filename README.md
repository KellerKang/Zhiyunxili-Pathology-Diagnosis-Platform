# 智云解析病理诊断平台（Web 版）

该目录提供一个基于 Flask 的 Web 应用，使 KEEP 病理诊断模型可以通过浏览器完成图片上传、预览与零样本推理。

## 主要特性
- 拖拽式上传，实时图片预览
- 一键调用 KEEP 模型进行零样本诊断，返回 Top-5 结果
- 自适应界面，复刻产品截图的布局与视觉风格

## 环境准备
```bash
cd webapp
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
```

## 启动
```bash
flask --app app run --reload
```
浏览器访问 http://127.0.0.1:5000

## 自定义
- `diagnosis_prompts`：在 `app.py` 中调节候选描述即可扩展分类范围
- 前端样式位于 `static/css/styles.css`
- 若需部署，可将 `debug=True` 改为 `False`，并使用 Gunicorn / Waitress 等生产级服务器

