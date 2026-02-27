#!/bin/bash
# Phase Agent Staking API - cURL Examples
# Basic API usage examples using curl commands

# Configuration
API_BASE_URL="https://staking-api.phase.com"
API_KEY="your-api-key-here"
AGENT_WALLET="7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper function to pretty print JSON
print_json() {
    echo "$1" | python3 -m json.tool 2>/dev/null || echo "$1"
}

echo -e "${BLUE}🚀 Phase Agent Staking API - cURL Examples${NC}\n"

# Check if required tools are available
if ! command -v curl &> /dev/null; then
    echo -e "${RED}❌ curl is required but not installed.${NC}"
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo -e "${YELLOW}⚠️ python3 not found - JSON output will not be formatted${NC}"
fi

echo -e "${BLUE}📋 Configuration:${NC}"
echo -e "  API Base URL: ${API_BASE_URL}"
echo -e "  Agent Wallet: ${AGENT_WALLET}"
echo -e "  API Key: ${API_KEY:0:8}...\n"

# 1. Health Check
echo -e "${BLUE}1. 🏥 Health Check${NC}"
echo -e "GET /health\n"

response=$(curl -s "${API_BASE_URL}/health")
status=$?

if [ $status -eq 0 ]; then
    echo -e "${GREEN}✅ Response:${NC}"
    print_json "$response"
else
    echo -e "${RED}❌ Health check failed${NC}"
fi

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# 2. API Documentation
echo -e "${BLUE}2. 📚 API Documentation${NC}"
echo -e "GET /api/docs\n"

response=$(curl -s "${API_BASE_URL}/api/docs")
status=$?

if [ $status -eq 0 ]; then
    echo -e "${GREEN}✅ Response (truncated):${NC}"
    echo "$response" | head -20
    echo "..."
else
    echo -e "${RED}❌ Documentation fetch failed${NC}"
fi

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# 3. Build Stake Transaction (requires API key)
echo -e "${BLUE}3. 🏗️ Build Stake Transaction${NC}"
echo -e "POST /stake/build\n"

if [ "$API_KEY" = "your-api-key-here" ]; then
    echo -e "${YELLOW}⚠️ Skipping stake transaction build - please set a valid API_KEY${NC}"
else
    echo -e "${BLUE}Request:${NC}"
    request_body='{
        "agentWallet": "'$AGENT_WALLET'",
        "stakeAmount": 1.0
    }'
    echo "$request_body" | python3 -m json.tool

    echo -e "\n${BLUE}Command:${NC}"
    echo "curl -X POST \"${API_BASE_URL}/stake/build\" \\"
    echo "  -H \"Content-Type: application/json\" \\"
    echo "  -H \"Authorization: Bearer \${API_KEY}\" \\"
    echo "  -d '${request_body}'"

    response=$(curl -s -X POST "${API_BASE_URL}/stake/build" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${API_KEY}" \
        -d "$request_body")
    
    status=$?
    
    if [ $status -eq 0 ]; then
        echo -e "\n${GREEN}✅ Response:${NC}"
        print_json "$response"
    else
        echo -e "\n${RED}❌ Stake transaction build failed${NC}"
    fi
fi

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# 4. Build Stake Transaction with Specific Validator
echo -e "${BLUE}4. 🎯 Build Stake Transaction with Specific Validator${NC}"
echo -e "POST /stake/build\n"

if [ "$API_KEY" = "your-api-key-here" ]; then
    echo -e "${YELLOW}⚠️ Skipping validator-specific staking - please set a valid API_KEY${NC}"
else
    echo -e "${BLUE}Request:${NC}"
    request_body='{
        "agentWallet": "'$AGENT_WALLET'",
        "stakeAmount": 2.5,
        "validatorVoteAccount": "8p1VGE8YZYfYAJaJ9UfZLFjR5jhJhzjzKvVv5HYjLXhm"
    }'
    echo "$request_body" | python3 -m json.tool

    echo -e "\n${BLUE}Command:${NC}"
    echo "curl -X POST \"${API_BASE_URL}/stake/build\" \\"
    echo "  -H \"Content-Type: application/json\" \\"
    echo "  -H \"Authorization: Bearer \${API_KEY}\" \\"
    echo "  -d '${request_body}'"

    response=$(curl -s -X POST "${API_BASE_URL}/stake/build" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${API_KEY}" \
        -d "$request_body")
    
    status=$?
    
    if [ $status -eq 0 ]; then
        echo -e "\n${GREEN}✅ Response:${NC}"
        print_json "$response"
    else
        echo -e "\n${RED}❌ Validator-specific staking failed${NC}"
    fi
fi

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# 5. Error Example - Invalid API Key
echo -e "${BLUE}5. ❌ Error Example - Invalid API Key${NC}"
echo -e "POST /stake/build (with invalid API key)\n"

echo -e "${BLUE}Request:${NC}"
request_body='{
    "agentWallet": "'$AGENT_WALLET'",
    "stakeAmount": 1.0
}'
echo "$request_body" | python3 -m json.tool

response=$(curl -s -X POST "${API_BASE_URL}/stake/build" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer invalid-api-key" \
    -d "$request_body")

echo -e "\n${GREEN}✅ Expected Error Response:${NC}"
print_json "$response"

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# 6. Metrics Endpoint
echo -e "${BLUE}6. 📊 Prometheus Metrics${NC}"
echo -e "GET /metrics\n"

response=$(curl -s "${API_BASE_URL}/metrics")
status=$?

if [ $status -eq 0 ]; then
    echo -e "${GREEN}✅ Response (first 20 lines):${NC}"
    echo "$response" | head -20
    echo "..."
    echo -e "\n${BLUE}Total lines: $(echo "$response" | wc -l)${NC}"
else
    echo -e "${RED}❌ Metrics fetch failed${NC}"
fi

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# 7. Complete workflow example
echo -e "${BLUE}7. 🔄 Complete Workflow Example${NC}"
echo -e "Health Check → Build Transaction → Extract Data\n"

if [ "$API_KEY" = "your-api-key-here" ]; then
    echo -e "${YELLOW}⚠️ Skipping complete workflow - please set a valid API_KEY${NC}"
else
    echo -e "${BLUE}Step 1: Check API Health${NC}"
    health_response=$(curl -s "${API_BASE_URL}/health")
    health_status=$(echo "$health_response" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data['data']['status'])" 2>/dev/null || echo "unknown")
    
    if [ "$health_status" = "healthy" ]; then
        echo -e "${GREEN}✅ API is healthy${NC}"
        
        echo -e "\n${BLUE}Step 2: Build Transaction${NC}"
        stake_response=$(curl -s -X POST "${API_BASE_URL}/stake/build" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${API_KEY}" \
            -d '{
                "agentWallet": "'$AGENT_WALLET'",
                "stakeAmount": 1.0
            }')
        
        # Extract key information
        success=$(echo "$stake_response" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('success', False))" 2>/dev/null || echo "false")
        
        if [ "$success" = "True" ]; then
            echo -e "${GREEN}✅ Transaction built successfully${NC}"
            
            echo -e "\n${BLUE}Step 3: Extract Key Information${NC}"
            stake_account=$(echo "$stake_response" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data['data']['metadata']['stakeAccount'])" 2>/dev/null || echo "N/A")
            validator=$(echo "$stake_response" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data['data']['metadata']['validator'])" 2>/dev/null || echo "N/A")
            estimated_apy=$(echo "$stake_response" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data['data']['metadata']['estimatedApy'])" 2>/dev/null || echo "N/A")
            
            echo -e "  📝 Stake Account: ${stake_account}"
            echo -e "  🎯 Validator: ${validator}"
            echo -e "  📈 Estimated APY: ${estimated_apy}%"
            
            echo -e "\n${GREEN}🎉 Workflow completed successfully!${NC}"
            echo -e "${BLUE}Next steps:${NC}"
            echo -e "  1. Review the transaction details"
            echo -e "  2. Sign the transaction with your private key"
            echo -e "  3. Submit to the Solana network"
            echo -e "  4. Monitor activation status"
        else
            echo -e "${RED}❌ Transaction build failed${NC}"
            print_json "$stake_response"
        fi
    else
        echo -e "${RED}❌ API is not healthy${NC}"
    fi
fi

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "${GREEN}✅ Examples completed!${NC}\n"

echo -e "${BLUE}📝 Usage Notes:${NC}"
echo -e "  • Replace API_KEY with your actual API key"
echo -e "  • Replace AGENT_WALLET with your wallet address"  
echo -e "  • All endpoints except /health and /api/docs require authentication"
echo -e "  • Test on devnet first before using mainnet"
echo -e "  • Always verify transaction details before signing"

echo -e "\n${BLUE}🔗 Useful Links:${NC}"
echo -e "  • API Documentation: ${API_BASE_URL}/api/docs"
echo -e "  • OpenAPI Spec: ${API_BASE_URL}/api/docs/openapi"
echo -e "  • Health Status: ${API_BASE_URL}/health"
echo -e "  • Metrics: ${API_BASE_URL}/metrics"

echo -e "\n${GREEN}Happy Staking! 🚀${NC}"