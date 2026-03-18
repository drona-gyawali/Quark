#!/bin/bash

# --- Color Codes ---
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' 

echo -e "${BLUE}=======================================================${NC}"
echo -e "${GREEN}     QUARK: Talk to your docs. No fluff, just facts.  ${NC}"
echo -e "${BLUE}=======================================================${NC}"

# 1. Handle .env file
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo -e "${YELLOW}Creating .env from .env.example...${NC}"
        cp .env.example .env
        echo -e "${GREEN}✔ .env file created.${NC}"
    else
        echo -e "${RED}✘ .env.example not found! Creating a blank .env instead.${NC}"
        touch .env
    fi
else
    echo -e "${YELLOW} .env already exists. Skipping copy.${NC}"
fi

# 2. Setup Python Virtual Environment
echo -e "\n${BLUE}Setting up Python Virtual Environment...${NC}"
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" || "$OSTYPE" == "cygwin" ]]; then
    # Windows paths
    python -m venv venv
    source venv/Scripts/activate
else
    # Linux/macOS paths
    python3 -m venv venv
    source venv/bin/activate
fi

# Install Python requirements
if [ -f requirements.txt ]; then
    pip install --upgrade pip
    pip install -r requirements.txt
    echo -e "${GREEN}✔ Python dependencies installed.${NC}"
else
    echo -e "${YELLOW}⚠ requirements.txt not found. Skipping pip install.${NC}"
fi

# 3. Setup Node.js Dependencies
echo -e "\n${BLUE}Installing Node.js dependencies...${NC}"
if command -v npm &> /dev/null; then
    npm install
    echo -e "${GREEN}✔ NPM packages installed.${NC}"
else
    echo -e "${RED}✘ NPM not found. Please install Node.js.${NC}"
    exit 1
fi

# 4. Final Verification
echo -e "\n${BLUE}Running tests to confirm setup...${NC}"
npm test

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}=======================================${NC}"
    echo -e "${GREEN}   SUCCESS: QUARK IS READY TO GO!      ${NC}"
    echo -e "${GREEN}=======================================${NC}"
    echo -e "${YELLOW}Action Required: Please fill in the placeholders in your .env file.${NC}"
    echo -e "Check Voyage AI, Qdrant, and Unstructured for your free API keys."
else
    echo -e "\n${RED}=======================================${NC}"
    echo -e "${RED}   SETUP FINISHED WITH TEST ERRORS     ${NC}"
    echo -e "${RED}=======================================${NC}"
    echo -e "${YELLOW}Review the logs above. Most likely, problem is with dependencies or .env configuration.${NC}"
fi
