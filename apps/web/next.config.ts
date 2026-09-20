import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/onnx packages must be required at runtime, not bundled.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
};

export default nextConfig;
