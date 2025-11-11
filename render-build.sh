#!/usr/bin/env bash
# Render Build Script for Backend

set -o errexit  # Exit on error

echo "🔧 Installing dependencies..."
npm install

echo "✅ Build completed successfully!"
