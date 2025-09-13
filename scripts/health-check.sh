#!/bin/bash
# Master Codetta - System Health Monitoring
# Expert-level compliance system diagnostics

set -euo pipefail

# Configuration
REPO="${GITHUB_REPOSITORY:-reconsumeralization/gemini-cli}"
WORKFLOW_NAME="PR Compliance & Security Enforcement"
THRESHOLD_WARNING=80
THRESHOLD_CRITICAL=95

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Expert logging
log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%H:%M:%S')] ERROR:${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')] SUCCESS:${NC} $1"
}

warning() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')] WARNING:${NC} $1"
}

# Check GitHub CLI availability
check_github_cli() {
    if ! command -v gh &> /dev/null; then
        error "GitHub CLI (gh) is not installed or not in PATH"
        return 1
    fi

    if ! gh auth status &> /dev/null; then
        error "GitHub CLI is not authenticated. Run 'gh auth login'"
        return 1
    fi

    success "GitHub CLI authenticated and ready"
}

# Check repository access
check_repo_access() {
    if ! gh repo view "$REPO" &> /dev/null; then
        error "Cannot access repository: $REPO"
        return 1
    fi

    success "Repository access confirmed: $REPO"
}

# Check workflow status
check_workflow_status() {
    local workflow_runs
    workflow_runs=$(gh run list --repo "$REPO" --workflow="$WORKFLOW_NAME" --limit 5 --json status,conclusion,createdAt)

    if [[ -z "$workflow_runs" ]]; then
        warning "No recent workflow runs found for: $WORKFLOW_NAME"
        return 1
    fi

    local total_runs=0
    local successful_runs=0

    while IFS= read -r run; do
        ((total_runs++))
        if [[ $(echo "$run" | jq -r '.status == "completed" and .conclusion == "success"') == "true" ]]; then
            ((successful_runs++))
        fi
    done <<< "$(echo "$workflow_runs" | jq -c '.[]')"

    local success_rate=$((successful_runs * 100 / total_runs))

    if [[ $success_rate -ge $THRESHOLD_CRITICAL ]]; then
        success "Workflow success rate: ${success_rate}% (Excellent)"
    elif [[ $success_rate -ge $THRESHOLD_WARNING ]]; then
        warning "Workflow success rate: ${success_rate}% (Acceptable)"
    else
        error "Workflow success rate: ${success_rate}% (Needs Attention)"
        return 1
    fi
}

# Check compliance labels
check_compliance_labels() {
    local pr_count
    pr_count=$(gh pr list --repo "$REPO" --state open --json number | jq length)

    local compliance_passed
    compliance_passed=$(gh pr list --repo "$REPO" --state open --label "compliance:passed" --json number | jq length)

    local compliance_failed
    compliance_failed=$(gh pr list --repo "$REPO" --state open --label "compliance:failed" --json number | jq length)

    if [[ $pr_count -eq 0 ]]; then
        warning "No open PRs found to check compliance status"
        return 0
    fi

    local compliance_rate=$(( (compliance_passed + compliance_failed) * 100 / pr_count ))

    success "Compliance coverage: ${compliance_rate}% ($((compliance_passed + compliance_failed))/$pr_count PRs checked)"
    success "✅ Passed: $compliance_passed PRs"
    if [[ $compliance_failed -gt 0 ]]; then
        warning "❌ Failed: $compliance_failed PRs need attention"
    fi
}

# Check zone reviewer assignments
check_zone_assignments() {
    local security_prs
    security_prs=$(gh pr list --repo "$REPO" --state open --label "zone:security" --json number | jq length)

    if [[ $security_prs -gt 0 ]]; then
        success "Security zone active: $security_prs PRs under security review"

        # Check for unassigned security PRs
        local unassigned_security=0
        local security_pr_numbers
        mapfile -t security_pr_numbers < <(gh pr list --repo "$REPO" --state open --label "zone:security" --json number | jq -r '.[].number')

        for pr_num in "${security_pr_numbers[@]}"; do
            local reviewers
            reviewers=$(gh pr view "$pr_num" --repo "$REPO" --json assignees | jq '.assignees | length')
            if [[ $reviewers -eq 0 ]]; then
                ((unassigned_security++))
            fi
        done

        if [[ $unassigned_security -gt 0 ]]; then
            warning "$unassigned_security security PRs lack reviewer assignment"
        else
            success "All security PRs have reviewers assigned"
        fi
    fi
}

# Check system performance
check_performance() {
    local recent_runs
    recent_runs=$(gh run list --repo "$REPO" --workflow="$WORKFLOW_NAME" --limit 10 --json createdAt,updatedAt)

    if [[ -z "$recent_runs" ]]; then
        warning "No performance data available"
        return 0
    fi

    local total_duration=0
    local run_count=0

    while IFS= read -r run; do
        local created_at updated_at duration
        created_at=$(echo "$run" | jq -r '.createdAt')
        updated_at=$(echo "$run" | jq -r '.updatedAt')

        if [[ "$created_at" != "null" && "$updated_at" != "null" ]]; then
            local created_ts updated_ts
            created_ts=$(date -d "$created_at" +%s 2>/dev/null || echo "0")
            updated_ts=$(date -d "$updated_at" +%s 2>/dev/null || echo "0")

            if [[ $created_ts -gt 0 && $updated_ts -gt 0 ]]; then
                duration=$((updated_ts - created_ts))
                total_duration=$((total_duration + duration))
                ((run_count++))
            fi
        fi
    done <<< "$(echo "$recent_runs" | jq -c '.[]')"

    if [[ $run_count -gt 0 ]]; then
        local avg_duration=$((total_duration / run_count))
        local avg_minutes=$((avg_duration / 60))

        if [[ $avg_minutes -lt 5 ]]; then
            success "Average workflow duration: ${avg_minutes}m (Excellent performance)"
        elif [[ $avg_minutes -lt 10 ]]; then
            success "Average workflow duration: ${avg_minutes}m (Good performance)"
        else
            warning "Average workflow duration: ${avg_minutes}m (Consider optimization)"
        fi
    fi
}

# Main health check execution
main() {
    log "🔍 Master Codetta: Initiating system health assessment..."

    local checks_passed=0
    local total_checks=0

    # Execute all health checks
    local checks=(
        "check_github_cli"
        "check_repo_access"
        "check_workflow_status"
        "check_compliance_labels"
        "check_zone_assignments"
        "check_performance"
    )

    for check in "${checks[@]}"; do
        ((total_checks++))
        log "Running: $check"
        if $check; then
            ((checks_passed++))
        fi
        echo
    done

    # Final assessment
    local success_rate=$((checks_passed * 100 / total_checks))

    echo "========================================"
    echo "🏥 SYSTEM HEALTH ASSESSMENT COMPLETE"
    echo "========================================"
    echo "Checks Passed: $checks_passed/$total_checks ($success_rate%)"
    echo "Repository: $REPO"
    echo "Timestamp: $(date)"
    echo

    if [[ $success_rate -ge 80 ]]; then
        success "🎯 System Health: EXCELLENT"
        success "✅ All critical systems operational"
        echo "Master Codetta assessment: System performing optimally"
    elif [[ $success_rate -ge 60 ]]; then
        warning "⚠️  System Health: GOOD"
        echo "Minor optimizations recommended"
    else
        error "🚨 System Health: NEEDS ATTENTION"
        echo "Immediate review and remediation required"
        return 1
    fi
}

# Execute main function
main "$@"
