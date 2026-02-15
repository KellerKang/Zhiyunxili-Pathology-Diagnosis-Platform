import base64
import io
import os
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Tuple

from flask import Flask, jsonify, render_template, request
from PIL import Image
import torch
from torchvision import transforms
from transformers import AutoModel, AutoTokenizer
import platform
import psutil


def load_model(device: torch.device):
    model = AutoModel.from_pretrained(
        "Astaxanthin/KEEP",
        trust_remote_code=True
    ).to(device)
    model.eval()
    tokenizer = AutoTokenizer.from_pretrained(
        "Astaxanthin/KEEP",
        trust_remote_code=True
    )
    return model, tokenizer


def build_text_features(
    model,
    tokenizer,
    categories: List[str],
    device: torch.device
) -> Tuple[torch.Tensor, List[str]]:
    tokenized = tokenizer(
        categories,
        max_length=256,
        padding="max_length",
        truncation=True,
        return_tensors="pt"
    )
    tokenized = {k: v.to(device) for k, v in tokenized.items()}
    with torch.inference_mode():
        features = model.encode_text(tokenized)
    return torch.nn.functional.normalize(features, dim=-1), categories


def get_system_status(device: torch.device):
    boot_time = datetime.fromtimestamp(psutil.boot_time())
    uptime_hours = (datetime.utcnow() - boot_time).total_seconds() / 3600
    gpu_info = "CPU only"
    gpu_memory = None
    if torch.cuda.is_available():
        gpu = torch.cuda.get_device_properties(0)
        gpu_info = f"{gpu.name}"
        gpu_memory = f"{torch.cuda.memory_allocated(0) / (1024 ** 3):.1f}GB / {gpu.total_memory / (1024 ** 3):.1f}GB"
    return {
        "os": platform.platform(),
        "service_version": "1.2.0-beta",
        "uptime": f"{uptime_hours:.1f} h",
        "node": platform.node(),
        "cpu": platform.processor() or "Unknown CPU",
        "memory": f"{psutil.virtual_memory().percent}% · {psutil.virtual_memory().used / (1024 ** 3):.0f}GB",
        "gpu": gpu_info,
        "gpu_memory": gpu_memory or "N/A",
        "device": str(device)
    }


def create_app():
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB

    allowed_extensions = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, tokenizer = load_model(device)
    diagnosis_prompts = [
        "an H&E image of breast invasive carcinoma.",
        "an H&E image of lung adenocarcinoma.",
        "an H&E image of glioblastoma.",
        "an H&E image of colorectal adenocarcinoma.",
        "an H&E image of prostate cancer.",
        "an H&E image of stomach adenocarcinoma.",
        "an H&E image of liver hepatocellular carcinoma.",
        "an H&E image of kidney renal clear cell carcinoma.",
        "an H&E image of esophageal cancer.",
        "an H&E image of normal tissue."
    ]
    text_features, categories = build_text_features(
        model, tokenizer, diagnosis_prompts, device
    )

    image_transform = transforms.Compose([
        transforms.Resize(
            size=224,
            interpolation=transforms.InterpolationMode.BICUBIC
        ),
        transforms.CenterCrop(size=(224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=(0.485, 0.456, 0.406),
            std=(0.229, 0.224, 0.225)
        ),
    ])

    def allowed_file(filename: str) -> bool:
        return Path(filename).suffix.lower() in allowed_extensions

    @app.route("/", methods=["GET"])
    def index():
        return render_template("index.html", categories=categories, system_status=get_system_status(device))

    @app.route("/status", methods=["GET"])
    def status():
        return jsonify(get_system_status(device))

    @app.route("/analyze", methods=["POST"])
    def analyze():
        if "image" not in request.files:
            return jsonify({"error": "未接收到图片文件"}), 400

        file = request.files["image"]
        if file.filename == "":
            return jsonify({"error": "请选择要分析的图片"}), 400

        if not allowed_file(file.filename):
            return jsonify({"error": "仅支持 JPG/PNG/TIF 格式"}), 400

        try:
            image = Image.open(file.stream).convert("RGB")
        except Exception:
            return jsonify({"error": "无法读取图片，请确认文件是否损坏"}), 400

        image_tensor = image_transform(image).unsqueeze(0).to(device)

        start = time.perf_counter()
        with torch.inference_mode():
            img_feature = model.encode_image(image_tensor)
            img_feature = torch.nn.functional.normalize(img_feature, dim=-1)
            similarity = img_feature @ text_features.T
            probabilities = torch.softmax(similarity, dim=-1).squeeze(0)
        inference_time = time.perf_counter() - start

        best_idx = int(torch.argmax(probabilities).item())
        confidence = float(probabilities[best_idx])
        similarity_value = float(similarity.squeeze(0)[best_idx])
        timestamp = datetime.utcnow().isoformat() + "Z"

        result = {
            "analysis_id": str(uuid.uuid4()),
            "label": categories[best_idx],
            "confidence": confidence,
            "similarity": similarity_value,
            "prompt": diagnosis_prompts[best_idx],
            "timestamp": timestamp,
        }

        buffered = io.BytesIO()
        image.thumbnail((600, 600))
        image.save(buffered, format="PNG")

        preview = base64.b64encode(buffered.getvalue()).decode("utf-8")

        return jsonify({
            "result": result,
            "preview": preview,
            "metadata": {
                "device": str(device),
                "inference_time": inference_time,
                "classes": len(categories)
            }
        })

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)

