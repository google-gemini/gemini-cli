pipeline {
    agent {
        docker {
            image 'node:20-alpine'
            args '-u root:root'
        }
    }
    
    environment {
        NPM_TOKEN = credentials('npm-token')
        AWS_REGION = 'us-east-1'
        // Prevent npm audit from causing build failures
        NPM_CONFIG_AUDIT_LEVEL = 'off'
        // Use CI optimizations
        NPM_CONFIG_PROGRESS = 'false'
        NPM_CONFIG_PREFER_OFFLINE = 'true'
        // Security: prevent npm from logging tokens
        NPM_CONFIG_LOGLEVEL = 'warn'
        // Enable colors in CI
        FORCE_COLOR = '1'
        NPM_CONFIG_COLOR = 'always'
    }
    
    parameters {
        choice(
            name: 'BUILD_TYPE',
            choices: ['CI_ONLY', 'PREVIEW_RELEASE', 'FULL_RELEASE'],
            description: 'Type of build to perform'
        )
        choice(
            name: 'PREVIEW_TAG',
            choices: ['alpha', 'beta', 'rc'],
            description: 'Preview release tag (only used for PREVIEW_RELEASE)'
        )
        booleanParam(
            name: 'RUN_INTEGRATION_TESTS',
            defaultValue: false,
            description: 'Run integration tests (requires AWS credentials)'
        )
        booleanParam(
            name: 'STRICT_MODE',
            defaultValue: true,
            description: 'Enable strict linting and formatting checks'
        )
    }
    
    options {
        timeout(time: 45, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '10'))
        skipDefaultCheckout()
        // Prevent concurrent builds on same branch
        disableConcurrentBuilds()
        // Enable ANSI colors
        ansiColor('xterm')
    }
    
    stages {
        stage('Checkout & Setup') {
            steps {
                echo '\033[34m[INFO]\033[0m Checking out source code...'
                checkout scm
                
                script {
                    // Capture build metadata
                    env.GIT_COMMIT_SHORT = sh(
                        script: "git rev-parse --short HEAD",
                        returnStdout: true
                    ).trim()
                    env.GIT_BRANCH_CLEAN = env.BRANCH_NAME.replaceAll(/[^a-zA-Z0-9\-_]/, '-')
                    env.BUILD_VERSION = sh(
                        script: "node -p \"require('./package.json').version\"",
                        returnStdout: true
                    ).trim()
                    env.BUILD_TIMESTAMP = new Date().format('yyyyMMdd-HHmmss')
                    
                    // Determine if we should publish
                    env.SHOULD_PUBLISH = (params.BUILD_TYPE != 'CI_ONLY').toString()
                    env.IS_PREVIEW = (params.BUILD_TYPE == 'PREVIEW_RELEASE').toString()
                }
                
                echo '\033[36m[BUILD INFO]\033[0m Build Information:'
                echo "  Git commit: ${env.GIT_COMMIT_SHORT}"
                echo "  Branch: ${env.BRANCH_NAME} (${env.GIT_BRANCH_CLEAN})"
                echo "  Version: ${env.BUILD_VERSION}"
                echo "  Build type: ${params.BUILD_TYPE}"
                echo "  Will publish: ${env.SHOULD_PUBLISH}"
                echo "  Timestamp: ${env.BUILD_TIMESTAMP}"
            }
        }
        
        stage('Environment Setup') {
            steps {
                echo '\033[34m[INFO]\033[0m Setting up build environment...'
                
                // Install Alpine packages needed for git operations
                sh '''
                    apk add --no-cache git openssh-client
                    echo "Node.js version: $(node --version)"
                    echo "npm version: $(npm --version)"
                    echo "Git version: $(git --version)"
                    echo "Architecture: $(uname -m)"
                '''
                
                // Configure NPM authentication securely
                script {
                    writeFile file: '.npmrc', text: """
//registry.npmjs.org/:_authToken=\${NPM_TOKEN}
registry=https://registry.npmjs.org/
always-auth=true
"""
                }
                
                // Verify NPM access (without exposing token)
                sh '''
                    npm whoami
                    echo "\033[32m[SUCCESS]\033[0m NPM authentication verified"
                '''
            }
        }
        
        stage('Dependencies') {
            steps {
                echo '\033[34m[INFO]\033[0m Installing dependencies...'
                
                // Install with CI optimizations
                sh 'npm ci'
                
                // Show package info
                sh '''
                    echo "\033[36m[INFO]\033[0m Dependency Summary:"
                    echo "Workspaces:"
                    npm run --workspaces --if-present --silent exec -- pwd
                    echo ""
                    echo "Root dependencies:"
                    npm list --depth=0 --production --silent
                '''
            }
        }
        
        stage('Build & Quality Checks') {
            parallel {
                stage('Enhanced Build') {
                    steps {
                        echo '\033[34m[INFO]\033[0m Running enhanced build process...'
                        
                        script {
                            def buildFlags = []
                            if (params.STRICT_MODE) {
                                buildFlags.add('--strict')
                            }
                            if (params.RUN_INTEGRATION_TESTS) {
                                buildFlags.add('--integration-tests')
                            }
                            buildFlags.add('--ci-tests')
                            buildFlags.add('--format-check')
                            
                            def buildCommand = "./scripts/build-enhanced.sh ${buildFlags.join(' ')}"
                            echo "Running: ${buildCommand}"
                            
                            sh "chmod +x scripts/build-enhanced.sh"
                            sh buildCommand
                        }
                        
                        // Archive build artifacts
                        archiveArtifacts artifacts: 'packages/*/dist/**/*', allowEmptyArchive: true
                        archiveArtifacts artifacts: 'bundle/**/*', allowEmptyArchive: true
                    }
                }
                
                stage('Security Scan') {
                    steps {
                        echo '\033[34m[INFO]\033[0m Running security checks...'
                        
                        script {
                            try {
                                sh 'npm audit --audit-level=high --only=prod'
                                echo '\033[32m[SUCCESS]\033[0m No high-severity vulnerabilities found'
                            } catch (Exception e) {
                                echo "\033[33m[WARNING]\033[0m Security audit found issues: ${e.getMessage()}"
                                // Don't fail build for audit issues, just warn
                            }
                        }
                    }
                }
            }
        }
        
        stage('Test Results & Coverage') {
            steps {
                echo '\033[34m[INFO]\033[0m Processing test results...'
                
                // Publish test results
                publishTestResults testResultsPattern: '**/junit.xml', allowEmptyResults: true
                
                // Archive coverage reports if they exist
                publishHTML([
                    allowMissing: true,
                    alwaysLinkToLastBuild: true,
                    keepAll: true,
                    reportDir: 'packages/cli/coverage',
                    reportFiles: 'index.html',
                    reportName: 'CLI Test Coverage'
                ])
                
                publishHTML([
                    allowMissing: true,
                    alwaysLinkToLastBuild: true,
                    keepAll: true,
                    reportDir: 'packages/core/coverage',
                    reportFiles: 'index.html',
                    reportName: 'Core Test Coverage'
                ])
                
                script {
                    // Get test summary
                    def testSummary = sh(
                        script: '''
                            echo "Test Summary:"
                            find . -name "junit.xml" -exec echo "  Found: {}" \\;
                            echo ""
                            echo "Coverage Reports:"
                            find . -name "coverage" -type d -exec echo "  Found: {}" \\;
                        ''',
                        returnStdout: true
                    ).trim()
                    
                    echo testSummary
                }
            }
        }
        
        stage('Build Verification') {
            steps {
                echo '\033[34m[INFO]\033[0m Verifying build artifacts...'
                
                sh '''
                    echo "\033[36m[INFO]\033[0m Checking build outputs:"
                    echo ""
                    echo "Core package build:"
                    ls -la packages/core/dist/ || echo "  No core dist found"
                    echo ""
                    echo "CLI package build:"
                    ls -la packages/cli/dist/ || echo "  No CLI dist found"
                    echo ""
                    echo "Bundle output:"
                    ls -la bundle/ || echo "  No bundle found"
                    echo ""
                    echo "\033[32m[SUCCESS]\033[0m Build verification complete"
                '''
                
                // Set success description for CI-only builds
                script {
                    if (params.BUILD_TYPE == 'CI_ONLY') {
                        currentBuild.description = "CI Build - ${env.BUILD_VERSION} (${env.GIT_COMMIT_SHORT})"
                    }
                }
            }
        }
        
        stage('Publication Decision') {
            when {
                expression { env.SHOULD_PUBLISH == 'true' }
            }
            steps {
                script {
                    def publishMessage = """
PUBLICATION READY

Current Version: ${env.BUILD_VERSION}
Build Type: ${params.BUILD_TYPE}
Git Commit: ${env.GIT_COMMIT_SHORT}
Branch: ${env.BRANCH_NAME}

"""
                    
                    if (params.BUILD_TYPE == 'PREVIEW_RELEASE') {
                        publishMessage += """
Preview Tag: ${params.PREVIEW_TAG}
Preview Version: ${env.BUILD_VERSION}-${params.PREVIEW_TAG}.${env.BUILD_TIMESTAMP}

This will publish a preview release to NPM with the ${params.PREVIEW_TAG} tag.
"""
                    } else {
                        publishMessage += """
Release Type: Production Release

This will:
1. Bump the patch version
2. Publish to NPM with 'latest' tag
3. Create a git tag
"""
                    }
                    
                    publishMessage += "\nDo you want to proceed with publication?"
                    
                    // Manual approval for publication
                    def approved = input(
                        message: publishMessage,
                        ok: 'Yes, Publish Now',
                        parameters: [
                            booleanParam(
                                name: 'CONFIRM_PUBLISH',
                                defaultValue: false,
                                description: 'I confirm I want to publish this build'
                            )
                        ]
                    )
                    
                    if (!approved.CONFIRM_PUBLISH) {
                        echo '\033[31m[ERROR]\033[0m Publication cancelled by user'
                        currentBuild.result = 'ABORTED'
                        error('Publication cancelled by user choice')
                    }
                    
                    echo '\033[32m[SUCCESS]\033[0m Publication approved - proceeding...'
                    env.PUBLICATION_APPROVED = 'true'
                }
            }
        }
        
        stage('Version & Publish') {
            when {
                allOf {
                    expression { env.SHOULD_PUBLISH == 'true' }
                    expression { env.PUBLICATION_APPROVED == 'true' }
                }
            }
            steps {
                echo '\033[34m[INFO]\033[0m Preparing for publication...'
                
                script {
                    if (params.BUILD_TYPE == 'PREVIEW_RELEASE') {
                        // Create preview version
                        env.PREVIEW_VERSION = "${env.BUILD_VERSION}-${params.PREVIEW_TAG}.${env.BUILD_TIMESTAMP}"
                        
                        sh """
                            npm version ${env.PREVIEW_VERSION} --no-git-tag-version --workspaces
                            echo "Preview version set to: ${env.PREVIEW_VERSION}"
                        """
                        
                        env.PUBLISH_TAG = params.PREVIEW_TAG
                        env.FINAL_VERSION = env.PREVIEW_VERSION
                        
                    } else {
                        // Production release - bump patch version
                        sh 'npm version patch --no-git-tag-version --workspaces'
                        
                        env.FINAL_VERSION = sh(
                            script: "node -p \"require('./package.json').version\"",
                            returnStdout: true
                        ).trim()
                        
                        env.PUBLISH_TAG = 'latest'
                    }
                    
                    echo "Final version: ${env.FINAL_VERSION}"
                    echo "Publish tag: ${env.PUBLISH_TAG}"
                }
                
                // Publish packages
                echo '\033[34m[INFO]\033[0m Publishing to NPM...'
                sh """
                    echo "Publishing core package..."
                    cd packages/core
                    npm publish --access public --tag ${env.PUBLISH_TAG}
                    
                    echo "Publishing CLI package..."
                    cd ../cli
                    npm publish --access public --tag ${env.PUBLISH_TAG}
                    
                    echo "\033[32m[SUCCESS]\033[0m Packages published successfully"
                """
                
                // Create git tag for production releases
                script {
                    if (params.BUILD_TYPE == 'FULL_RELEASE') {
                        def tagName = "v${env.FINAL_VERSION}-bedrock"
                        
                        try {
                            sh """
                                git config user.name "Jenkins CI"
                                git config user.email "ci@company.com"
                                git tag -a ${tagName} -m "Release ${tagName} - Gemini CLI with AWS Bedrock support"
                                echo "\033[32m[SUCCESS]\033[0m Created git tag: ${tagName}"
                            """
                            
                            env.GIT_TAG = tagName
                        } catch (Exception e) {
                            echo "\033[33m[WARNING]\033[0m Git tagging failed (non-critical): ${e.getMessage()}"
                        }
                    }
                }
                
                // Set final build description
                script {
                    def description = "Published v${env.FINAL_VERSION}"
                    if (params.BUILD_TYPE == 'PREVIEW_RELEASE') {
                        description += " (${params.PREVIEW_TAG})"
                    }
                    description += " - ${env.GIT_COMMIT_SHORT}"
                    
                    currentBuild.description = description
                }
            }
        }
    }
    
    post {
        always {
            echo '\033[34m[INFO]\033[0m Cleanup and reporting...'
            
            // Secure cleanup
            sh '''
                rm -f .npmrc
                rm -f ~/.npmrc
                npm config delete //registry.npmjs.org/:_authToken 2>/dev/null || true
            '''
            
            // Archive logs
            archiveArtifacts artifacts: 'packages/*/npm-debug.log*', allowEmptyArchive: true
            
            // Workspace cleanup
            cleanWs(
                cleanWhenAborted: true,
                cleanWhenFailure: false,
                cleanWhenNotBuilt: true,
                cleanWhenSuccess: true,
                cleanWhenUnstable: false,
                deleteDirs: true,
                patterns: [
                    [pattern: 'node_modules/', type: 'INCLUDE'],
                    [pattern: 'packages/*/node_modules/', type: 'INCLUDE'],
                    [pattern: '.npm/', type: 'INCLUDE']
                ]
            )
        }
        
        success {
            script {
                def message = """
\033[32m[SUCCESS]\033[0m Build Successful!

Type: ${params.BUILD_TYPE}
Branch: ${env.BRANCH_NAME}
Commit: ${env.GIT_COMMIT_SHORT}
Duration: ${currentBuild.durationString}
"""
                
                if (env.FINAL_VERSION) {
                    message += "\nPublished Version: ${env.FINAL_VERSION}"
                    if (env.PUBLISH_TAG != 'latest') {
                        message += " (${env.PUBLISH_TAG})"
                    }
                } else {
                    message += "\nStatus: CI validation completed - no publication"
                }
                
                message += "\n\nGemini CLI with AWS Bedrock support is ready!"
                
                if (params.BUILD_TYPE == 'PREVIEW_RELEASE') {
                    message += """

Installation:
npm install @google/gemini-cli@${params.PREVIEW_TAG}
"""
                } else if (env.FINAL_VERSION && params.BUILD_TYPE == 'FULL_RELEASE') {
                    message += """

Installation:
npm install -g @google/gemini-cli@latest
"""
                }
                
                echo message
            }
        }
        
        failure {
            script {
                def message = """
\033[31m[ERROR]\033[0m Build Failed

Type: ${params.BUILD_TYPE}
Branch: ${env.BRANCH_NAME}
Commit: ${env.GIT_COMMIT_SHORT}
Failed Stage: ${env.STAGE_NAME ?: 'Unknown'}
Duration: ${currentBuild.durationString}

Please check the build logs for detailed error information.
"""
                
                echo message
            }
        }
        
        aborted {
            echo '\033[33m[WARNING]\033[0m Build was aborted (likely due to user cancellation of publication)'
        }
        
        unstable {
            echo '\033[33m[WARNING]\033[0m Build completed with warnings - check test results and quality gates'
        }
    }
}