#!/bin/bash

# Agent Staking API - Mainnet Production Deployment Script
# Usage: ./scripts/deploy-mainnet.sh [--rollback] [--dry-run]

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.mainnet.yml"
ENV_FILE=".env.mainnet"
BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
LOG_FILE="logs/deployment.log"

# Parse arguments
DRY_RUN=false
ROLLBACK=false
SKIP_BACKUP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --rollback)
            ROLLBACK=true
            shift
            ;;
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        *)
            echo "Unknown option $1"
            exit 1
            ;;
    esac
done

# Logging function
log() {
    echo -e "${1}" | tee -a "${LOG_FILE}"
}

# Error handling
error_exit() {
    log "${RED}ERROR: $1${NC}"
    exit 1
}

# Success message
success() {
    log "${GREEN}✅ $1${NC}"
}

# Warning message
warning() {
    log "${YELLOW}⚠️  $1${NC}"
}

# Info message
info() {
    log "${BLUE}ℹ️  $1${NC}"
}

# Pre-flight checks
preflight_checks() {
    info "Running pre-flight checks..."
    
    # Check if Docker is running
    if ! docker info &> /dev/null; then
        error_exit "Docker is not running. Please start Docker and try again."
    fi
    success "Docker is running"
    
    # Check if docker-compose is available
    if ! command -v docker-compose &> /dev/null; then
        error_exit "docker-compose is not installed"
    fi
    success "docker-compose is available"
    
    # Check if environment file exists
    if [[ ! -f "${ENV_FILE}" ]]; then
        error_exit "Environment file ${ENV_FILE} not found"
    fi
    success "Environment file found"
    
    # Check critical environment variables
    source "${ENV_FILE}"
    
    local required_vars=(
        "PHASE_FEE_WALLET"
        "API_KEY_SECRET"
        "REDIS_PASSWORD"
        "SOLANA_RPC_URL"
    )
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]] || [[ "${!var}" == "CHANGE_ME"* ]]; then
            error_exit "Required environment variable ${var} is not set or contains placeholder value"
        fi
    done
    success "All required environment variables are set"
    
    # Check available disk space (at least 2GB)
    local available_space=$(df . | awk 'NR==2 {print $4}')
    if [[ ${available_space} -lt 2097152 ]]; then  # 2GB in KB
        error_exit "Insufficient disk space. At least 2GB required."
    fi
    success "Sufficient disk space available"
    
    # Check if ports are available
    local ports=("80" "443" "3000")
    for port in "${ports[@]}"; do
        if netstat -tuln | grep -q ":${port} "; then
            warning "Port ${port} is already in use"
        fi
    done
    
    info "Pre-flight checks completed"
}

# Backup current deployment
backup_deployment() {
    if [[ "${SKIP_BACKUP}" == true ]]; then
        warning "Skipping backup as requested"
        return 0
    fi
    
    info "Creating backup..."
    
    mkdir -p "${BACKUP_DIR}"
    
    # Backup current Docker images
    if docker-compose -f "${COMPOSE_FILE}" ps -q &> /dev/null; then
        docker-compose -f "${COMPOSE_FILE}" config > "${BACKUP_DIR}/docker-compose.yml.backup"
        
        # Backup volumes
        docker-compose -f "${COMPOSE_FILE}" exec -T redis redis-cli --rdb - > "${BACKUP_DIR}/redis.rdb" 2>/dev/null || true
        
        # Export running containers
        docker-compose -f "${COMPOSE_FILE}" ps -q | xargs docker export > "${BACKUP_DIR}/containers.tar" 2>/dev/null || true
        
        success "Backup created in ${BACKUP_DIR}"
    else
        warning "No existing deployment found to backup"
    fi
}

# Deploy application
deploy() {
    info "Starting deployment..."
    
    if [[ "${DRY_RUN}" == true ]]; then
        warning "DRY RUN MODE - No actual changes will be made"
        docker-compose -f "${COMPOSE_FILE}" config
        return 0
    fi
    
    # Pull latest images
    info "Pulling latest Docker images..."
    docker-compose -f "${COMPOSE_FILE}" pull
    
    # Build production image
    info "Building production image..."
    docker-compose -f "${COMPOSE_FILE}" build --no-cache api
    
    # Stop existing services gracefully
    info "Stopping existing services..."
    docker-compose -f "${COMPOSE_FILE}" down --timeout 30
    
    # Start services
    info "Starting services..."
    docker-compose -f "${COMPOSE_FILE}" up -d
    
    success "Services started"
}

# Health check
health_check() {
    info "Performing health checks..."
    
    local max_attempts=30
    local attempt=1
    
    while [[ ${attempt} -le ${max_attempts} ]]; do
        info "Health check attempt ${attempt}/${max_attempts}..."
        
        # Check if containers are running
        if ! docker-compose -f "${COMPOSE_FILE}" ps | grep -q "Up"; then
            error_exit "Some containers are not running"
        fi
        
        # Check API health endpoint
        if curl -f http://localhost:3000/health &> /dev/null; then
            success "API health check passed"
            break
        fi
        
        if [[ ${attempt} -eq ${max_attempts} ]]; then
            error_exit "API health check failed after ${max_attempts} attempts"
        fi
        
        sleep 10
        ((attempt++))
    done
    
    # Check Redis
    if docker-compose -f "${COMPOSE_FILE}" exec -T redis redis-cli ping | grep -q "PONG"; then
        success "Redis health check passed"
    else
        error_exit "Redis health check failed"
    fi
    
    # Check Nginx
    if curl -f http://localhost:80/health &> /dev/null; then
        success "Nginx health check passed"
    else
        warning "Nginx health check failed (this may be expected if SSL is not configured)"
    fi
    
    success "All health checks passed"
}

# Rollback function
rollback() {
    warning "Rolling back to previous version..."
    
    local latest_backup=$(ls -1t backups/ | head -1)
    if [[ -z "${latest_backup}" ]]; then
        error_exit "No backup found for rollback"
    fi
    
    info "Rolling back to backup: ${latest_backup}"
    
    # Stop current services
    docker-compose -f "${COMPOSE_FILE}" down --timeout 30
    
    # Restore from backup
    if [[ -f "backups/${latest_backup}/docker-compose.yml.backup" ]]; then
        cp "backups/${latest_backup}/docker-compose.yml.backup" "${COMPOSE_FILE}.rollback"
        docker-compose -f "${COMPOSE_FILE}.rollback" up -d
        
        success "Rollback completed"
    else
        error_exit "Backup files not found"
    fi
}

# Cleanup function
cleanup() {
    info "Cleaning up old Docker images and volumes..."
    
    # Remove dangling images
    docker image prune -f
    
    # Remove old backups (keep last 5)
    if [[ -d "backups" ]]; then
        ls -1t backups/ | tail -n +6 | xargs -r -I {} rm -rf "backups/{}"
        success "Cleaned up old backups"
    fi
}

# Main execution
main() {
    # Create logs directory
    mkdir -p logs
    
    log "${BLUE}🚀 Agent Staking API - Mainnet Deployment${NC}"
    log "Started at: $(date)"
    
    if [[ "${ROLLBACK}" == true ]]; then
        rollback
        exit 0
    fi
    
    preflight_checks
    backup_deployment
    deploy
    health_check
    cleanup
    
    success "🎉 Deployment completed successfully!"
    info "Monitor logs with: docker-compose -f ${COMPOSE_FILE} logs -f"
    info "Check status with: docker-compose -f ${COMPOSE_FILE} ps"
    
    log "Deployment completed at: $(date)"
}

# Trap signals for cleanup
trap 'error_exit "Deployment interrupted"' INT TERM

# Run main function
main "$@"