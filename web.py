import os
from flask import Flask, send_from_directory

app = Flask(__name__, static_folder="static")

@app.get("/")
def health():
    return "OK ✅ Mini App server running."

@app.get("/app")
def app_page():
    # Serve the WebApp page
    return send_from_directory("static", "app.html")

@app.get("/static/<path:path>")
def static_files(path):
    return send_from_directory("static", path)
