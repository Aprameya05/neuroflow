#!/bin/bash
# Run this on your A100 instance before training
# Works on RunPod, Vast.ai, Lambda Labs, Google Colab Pro

echo "Setting up NeuroFlow training environment..."

pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
pip install scikit-learn numpy pandas matplotlib onnx onnxruntime

echo "Verifying GPU..."
python3 -c "
import torch
print(f'PyTorch: {torch.__version__}')
print(f'CUDA available: {torch.cuda.is_available()}')
if torch.cuda.is_available():
    print(f'GPU: {torch.cuda.get_device_name(0)}')
    print(f'VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB')
"

echo "Done. Run training with:"
echo "python research/training/train.py --data_dir calibration_data/ --epochs 150"
