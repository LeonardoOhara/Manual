import os
from pathlib import Path

from flask import Flask, send_from_directory


ROOT = Path(__file__).resolve().parent
app = Flask(__name__, static_folder=str(ROOT / "static"), static_url_path="/static")


@app.get("/")
def index():
    return send_from_directory(ROOT, "index.html")


@app.get("/data/<path:filename>")
def catalog_file(filename):
    return send_from_directory(ROOT / "data", filename)


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1")


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1")
