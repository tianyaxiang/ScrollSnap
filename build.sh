#!/bin/bash

# ScrollSnap Chrome Extension Build Script
# Creates a zip file ready for Chrome Web Store submission

set -e

# Configuration
EXTENSION_DIR="scroll-capture-extension"
OUTPUT_NAME="ScrollSnap"
VERSION=$(grep '"version"' "$EXTENSION_DIR/manifest.json" | sed -E 's/.*"version": *"([^"]+)".*/\1/')

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}  ScrollSnap Build Script${NC}"
echo -e "${GREEN}================================${NC}"
echo ""

# Check if extension directory exists
if [ ! -d "$EXTENSION_DIR" ]; then
    echo -e "${RED}Error: Extension directory '$EXTENSION_DIR' not found${NC}"
    exit 1
fi

# Check if manifest.json exists
if [ ! -f "$EXTENSION_DIR/manifest.json" ]; then
    echo -e "${RED}Error: manifest.json not found${NC}"
    exit 1
fi

echo -e "${YELLOW}Version:${NC} $VERSION"
echo ""

# Create output filename with version
ZIP_FILE="${OUTPUT_NAME}-v${VERSION}.zip"

# Remove existing zip if present
if [ -f "$ZIP_FILE" ]; then
    echo -e "${YELLOW}Removing existing $ZIP_FILE...${NC}"
    rm -f "$ZIP_FILE"
fi

# Also remove the generic zip file
if [ -f "${OUTPUT_NAME}.zip" ]; then
    rm -f "${OUTPUT_NAME}.zip"
fi

echo -e "${YELLOW}Building extension package...${NC}"
echo ""

# Create zip file, excluding unnecessary files
cd "$EXTENSION_DIR"
zip -r "../$ZIP_FILE" . \
    -x "*.DS_Store" \
    -x "__MACOSX/*" \
    -x "*.git*" \
    -x "*.map" \
    -x "*.log" \
    -x "node_modules/*" \
    -x "*.md" \
    -x "*.sh" \
    -x "test/*" \
    -x "tests/*" \
    -x ".eslintrc*" \
    -x ".prettierrc*" \
    -x "*.config.js" \
    -x "package*.json" \
    -x "tsconfig.json"
cd ..

# Get file size
FILE_SIZE=$(ls -lh "$ZIP_FILE" | awk '{print $5}')

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}  Build Complete!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo -e "${YELLOW}Output:${NC} $ZIP_FILE"
echo -e "${YELLOW}Size:${NC}   $FILE_SIZE"
echo ""

# Validate zip contents
echo -e "${YELLOW}Package contents:${NC}"
unzip -l "$ZIP_FILE" | awk 'NR>3 && !/^-/ && NF>0 {print "  " $4}'
echo ""

# Check for required files
echo -e "${YELLOW}Validating required files...${NC}"
REQUIRED_FILES=("manifest.json" "background.js" "content.js" "popup/popup.html")
MISSING_FILES=()

for file in "${REQUIRED_FILES[@]}"; do
    if unzip -l "$ZIP_FILE" | grep -q "$file"; then
        echo -e "  ${GREEN}✓${NC} $file"
    else
        echo -e "  ${RED}✗${NC} $file (missing)"
        MISSING_FILES+=("$file")
    fi
done

echo ""

if [ ${#MISSING_FILES[@]} -eq 0 ]; then
    echo -e "${GREEN}Ready for Chrome Web Store submission!${NC}"
else
    echo -e "${RED}Warning: Some required files are missing${NC}"
    exit 1
fi
