import argparse
import os
import shutil
import warnings

# Suppress warnings
warnings.filterwarnings("ignore")

def export_model(model_name: str, output_dir: str):
    print(f"Loading '{model_name}' to export to ONNX...")
    from optimum.onnxruntime import ORTModelForFeatureExtraction
    from transformers import AutoTokenizer

    # Ensure output dir exists
    os.makedirs(output_dir, exist_ok=True)

    # 1. Load and Export Model
    model = ORTModelForFeatureExtraction.from_pretrained(model_name, export=True)
    model.save_pretrained(output_dir)
    print(f"ONNX Model exported to '{output_dir}'")

    # 2. Save Tokenizer
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    tokenizer.save_pretrained(output_dir)
    print(f"Tokenizer saved to '{output_dir}'")
    
    print("\nAssets ready. You need 'model.onnx', 'tokenizer.json' and 'vocab.txt'.")

if __name__ == "__main__":
    export_model("sentence-transformers/all-MiniLM-L6-v2", "../src-tauri/assets/models/all-MiniLM-L6-v2")
