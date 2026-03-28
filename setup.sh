#!/bin/bash

# --- Color Codes ---
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' 

echo -e "${BLUE}=======================================================${NC}"
echo -e "${GREEN}      QUARK: Talk to your docs. No fluff, just facts.   ${NC}"
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

# Load variables from .env
export $(grep -v '^#' .env | xargs)

# 2. Setup Python Virtual Environment
echo -e "\n${BLUE}Setting up Python Virtual Environment...${NC}"
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" || "$OSTYPE" == "cygwin" ]]; then
    python -m venv venv
    source venv/Scripts/activate
else
    python3 -m venv venv
    source venv/bin/activate
fi

if [ -f requirements.txt ]; then
    pip install --upgrade pip
    pip install -r requirements.txt
    echo -e "${GREEN}✔ Python dependencies installed.${NC}"
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

# 4. Database Migrations (NEW SECTION)
echo -e "\n${BLUE}Applying Database Migrations...${NC}"

if [ -z "$SUPABASE_DB_URL" ]; then
    echo -e "${YELLOW}⚠ SUPABASE_DB_URL not found in .env. Skipping migrations.${NC}"
else
    if command -v psql &> /dev/null; then
        # Loop through all .sql files in migrations folder
        for f in supabase/migrations/*.sql; do
            echo -e "${YELLOW}Applying $f...${NC}"
            psql "$SUPABASE_DB_URL" -f "$f" > /dev/null
        done
        echo -e "${GREEN}✔ All migrations applied successfully.${NC}"
    else
        echo -e "${RED}✘ psql not found. Please install postgresql-client to sync the database.${NC}"
        echo -e "${YELLOW}Hint: sudo apt install postgresql-client${NC}"
    fi
fi

# 5. Final Verification
echo -e "\n${BLUE}Running tests to confirm setup...${NC}"
npm test

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}=======================================${NC}"
    echo -e "${GREEN}   SUCCESS: QUARK IS READY TO GO!      ${NC}"
    echo -e "${GREEN}=======================================${NC}"
    echo -e "${YELLOW}Action Required: Ensure your .env keys are correct.${NC}"
else
    echo -e "\n${RED}=======================================${NC}"
    echo -e "${RED}   SETUP FINISHED WITH TEST ERRORS     ${NC}"
    echo -e "${RED}=======================================${NC}"
fi
