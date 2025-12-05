#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Paddle Bulk Customer Importer...${NC}"

# Check if Python and Node.js are installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 14 or higher."
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}📦 Installing frontend dependencies...${NC}"
    npm install
fi

if [ ! -f "venv/bin/activate" ]; then
    echo -e "${BLUE}🐍 Creating Python virtual environment...${NC}"
    python3 -m venv venv
fi

echo -e "${BLUE}🔧 Activating virtual environment and installing backend dependencies...${NC}"
source venv/bin/activate
pip3 install -r requirements.txt

# Function to cleanup background processes on exit
cleanup() {
    echo -e "\n${GREEN}🛑 Shutting down servers...${NC}"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start backend server
echo -e "${BLUE}🔧 Starting Flask backend server on http://localhost:5001...${NC}"
venv/bin/python3 app.py &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Start frontend server
echo -e "${BLUE}🎨 Starting React frontend server on http://localhost:3000...${NC}"
npm start &
FRONTEND_PID=$!

echo -e "${GREEN}✅ Both servers are starting up!${NC}"
echo -e "${GREEN}📱 Frontend will be available at: http://localhost:3000${NC}"
echo -e "${GREEN}🔧 Backend API will be available at: http://localhost:5001${NC}"
echo -e "${GREEN}⏹️  Press Ctrl+C to stop both servers${NC}"

# Wait for both processes
wait 