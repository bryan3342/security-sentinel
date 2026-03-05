# Security Sentinel

**An Autonomous Multi-Agent DevSecOps System for Continuous Security Monitoring and Self-Healing**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Required-blue.svg)](https://www.docker.com/)

---

## Project Overview

Security Sentinel is an autonomous, AI-powered security orchestration platform that transforms traditional DevSecOps workflows. Unlike conventional static analysis tools, Security Sentinel acts as a **"Self-Healing" robotic security guard** that:

- **Monitors** GitHub repositories for vulnerabilities in real-time
- **Researches** security issues using AI-powered analysis and web research
- **Engineers** verified patches autonomously through multi-agent orchestration
- **Tests** fixes in sandboxed Docker environments
- **Iterates** using self-correction loops until valid solutions are found
- **Documents** all findings and creates pull requests for human review

This project demonstrates advanced software engineering principles including **agentic AI orchestration, containerized sandbox execution, asynchronous state management, and autonomous code generation with validation loops**.

---

## Architecture

Security Sentinel employs a **Manager-Worker pattern** with **stateful self-correction loops**, consisting of three main architectural layers:

### Layer 1: Event Processing & Job Queue
- **Webhook Service** (Node.js/Express): Receives GitHub webhooks with HMAC signature verification
- **Job Queue** (BullMQ + Redis): Reliable, fault-tolerant task processing with retry logic
- **Security**: Timing-safe comparison, input validation, rate limiting

### Layer 2: AI Agent Orchestration
- **LangGraph Supervisor**: Multi-agent coordination and workflow management
- **Specialized Agents**:
  - **Triage Agent**: Analyzes security reports and filters false positives
  - **Researcher Agent**: Queries CVE databases and searches web for remediation patterns
  - **Mechanic Agent**: Generates code patches using Claude 3.5 Sonnet
  - **Validator Agent**: Runs tests and validates fixes in Docker sandbox

### Layer 3: Execution & Validation
- **Docker Sandbox**: Isolated environment for running untrusted code
- **Test Automation**: Executes existing test suites against patched code
- **GitHub Integration**: Automated PR creation with detailed security reports

```
┌─────────────────────────────────────────────────────────────────┐
│                         GitHub Repository                        │
└────────────────────────────┬────────────────────────────────────┘
                             │ Webhook (push/PR)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Layer 1: Event Processing                     │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐  │
│  │   Webhook    │─────▶│   BullMQ     │─────▶│    Redis     │  │
│  │   Service    │      │  Job Queue   │      │   Storage    │  │
│  │  (Express)   │      │              │      │              │  │
│  └──────────────┘      └──────────────┘      └──────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ Job Event
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Layer 2: Agentic Orchestration (LangGraph)          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Supervisor Agent                       │   │
│  └──────┬──────────────┬──────────────┬──────────────┬─────┘   │
│         │              │              │              │          │
│    ┌────▼────┐   ┌────▼────┐   ┌────▼────┐   ┌────▼────┐     │
│    │ Triage  │   │Research │   │ Mechanic│   │Validator│     │
│    │  Agent  │   │  Agent  │   │  Agent  │   │  Agent  │     │
│    └─────────┘   └─────────┘   └─────────┘   └─────────┘     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│            Layer 3: Sandboxed Execution & Testing                │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐  │
│  │   Docker     │─────▶│     Test     │─────▶│   GitHub     │  │
│  │   Sandbox    │      │  Validation  │      │   PR Bot     │  │
│  └──────────────┘      └──────────────┘      └──────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼ (if tests fail)
                      Self-Correction Loop
                   (Iterate until valid fix)
```

---

## Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Backend Orchestration** | Python 3.11+, LangGraph, LangChain | Multi-agent workflow management |
| **Event Processing** | Node.js 18+, Express.js | Webhook handling and API endpoints |
| **LLM Reasoning** | Claude 3.5 Sonnet, Anthropic API | Code analysis and patch generation |
| **Security Analysis** | Semgrep, Snyk API | Vulnerability detection |
| **Job Queue** | BullMQ, Redis | Asynchronous task processing |
| **Database** | PostgreSQL + pgvector | Long-term memory and RAG capabilities |
| **Containerization** | Docker, Docker SDK | Sandboxed code execution |
| **Version Control** | GitHub API, Octokit | Repository integration and PR automation |

---

## Key Features

### Autonomous Operation
- **24/7 Monitoring**: Continuous repository surveillance without human intervention
- **Self-Correction Loops**: Iteratively refines patches until tests pass
- **Context-Aware Analysis**: Understands project-specific code patterns and conventions

### Security-First Design
- **HMAC Signature Verification**: Validates all webhook payloads with timing-safe comparison
- **Sandboxed Execution**: All AI-generated code runs in isolated Docker containers
- **Defense in Depth**: Multiple security layers prevent malicious code execution
- **Rate Limiting**: Protects against webhook flooding attacks

### Intelligent Agent System
- **Multi-Agent Collaboration**: Specialized agents work together to solve complex security issues
- **Web Research Integration**: Agents search CVE databases and security documentation
- **RAG-Enhanced Memory**: Vector database enables learning from past successful fixes
- **Adaptive Planning**: Agents adjust strategies based on test feedback

### Comprehensive Reporting
- **Detailed PR Descriptions**: Clear explanations of vulnerabilities and fixes
- **Test Results**: Complete output from validation runs
- **Remediation Steps**: Documentation of the fix process for audit trails

---

## Implementation Status

### Completed (Layer 1 - Foundation)

#### Webhook Service
- [x] Express.js server with secure webhook endpoint
- [x] HMAC-SHA256 signature verification (timing-safe)
- [x] Request validation and error handling
- [x] Health check endpoints for monitoring
- [x] Environment configuration management

#### Job Queue System
- [x] BullMQ integration with Redis
- [x] Job processing with retry logic and exponential backoff
- [x] Queue event monitoring (completed, failed, stalled)
- [x] Graceful shutdown handling
- [x] Job status tracking and logging

#### Infrastructure
- [x] Docker containerization for development environment
- [x] Docker Compose orchestration (Node.js + Redis)
- [x] Volume mounting for hot-reload development
- [x] Network isolation and security configuration

#### Testing & Validation
- [x] Comprehensive test scripts for webhook service
- [x] Job queue verification scripts
- [x] HMAC signature testing utilities
- [x] Integration test suite for end-to-end validation

### In Progress (Layer 2 - Agentic Brain)

#### LangGraph Agent System
- [ ] Supervisor agent coordinator
- [ ] Triage agent for vulnerability analysis
- [ ] Researcher agent for CVE/security research
- [ ] Mechanic agent for patch generation
- [ ] Validator agent for test execution
- [ ] State management and checkpointing

#### AI Integration
- [ ] Claude API integration for code reasoning
- [ ] Prompt engineering for security analysis
- [ ] Context management for multi-turn conversations
- [ ] Token optimization strategies

### Planned (Layer 3 - Execution & Testing)

#### Docker Sandbox
- [ ] Dynamic container creation for test isolation
- [ ] Resource limits and security constraints
- [ ] File system management and cleanup
- [ ] Network policies for restricted internet access

#### GitHub Integration
- [ ] Automated PR creation with detailed reports
- [ ] Branch management for security patches
- [ ] Comment integration for test results
- [ ] Merge conflict detection and resolution

#### RAG System
- [ ] PostgreSQL with pgvector setup
- [ ] Embedding generation for code patterns
- [ ] Vector similarity search for past fixes
- [ ] Knowledge base management

---

## Installation & Setup

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+
- **Docker** and Docker Compose
- **Redis** (via Docker)
- **Git**

### Quick Start

```bash
# Clone the repository
git clone https://github.com/bryan3342/security-sentinel.git
cd security-sentinel

# Install Node.js dependencies
cd webhook-service
npm install

# Install Python dependencies
cd ../agent-system
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env with your API keys and configuration

# Start the infrastructure
docker-compose up -d

# Run the webhook service
cd webhook-service
npm run dev

# Run the agent system (in separate terminal)
cd agent-system
python main.py
```

### Environment Variables

```env
# GitHub Configuration
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
GITHUB_TOKEN=your_github_personal_access_token

# Anthropic API
ANTHROPIC_API_KEY=your_anthropic_api_key

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# PostgreSQL Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/security_sentinel

# Security Analysis
SEMGREP_API_KEY=your_semgrep_api_key
```

---

## Architecture Deep Dive

### Self-Correction Loop

The heart of Security Sentinel is its ability to iteratively refine solutions:

```python
def self_healing_loop(vulnerability):
    attempts = 0
    max_attempts = 5
    
    while attempts < max_attempts:
        # 1. Generate patch
        patch = mechanic_agent.generate_fix(vulnerability)
        
        # 2. Apply in sandbox
        sandbox = create_docker_sandbox()
        sandbox.apply_patch(patch)
        
        # 3. Run tests
        results = validator_agent.run_tests(sandbox)
        
        # 4. Check success
        if results.all_passed:
            return patch, results
        
        # 5. Analyze failure and iterate
        feedback = validator_agent.analyze_failure(results)
        mechanic_agent.update_plan(feedback)
        attempts += 1
    
    # Escalate to human if max attempts reached
    return None, "Unable to generate passing fix"
```

### Agent Communication Protocol

Agents communicate through a shared state graph managed by LangGraph:

```
[Triage Agent] 
    ↓ (vulnerability confirmed)
[Researcher Agent]
    ↓ (research findings)
[Mechanic Agent] ←─┐
    ↓              │ (retry with feedback)
[Validator Agent]  │
    ↓ (tests fail)─┘
    ↓ (tests pass)
[PR Creation]
```

---

## Learning Objectives & Skills Demonstrated

This project showcases senior-level engineering competencies:

### System Design
- **Microservice Architecture**: Separate services for concerns (webhooks, agents, execution)
- **Event-Driven Design**: Asynchronous processing with job queues
- **Stateful Workflows**: Managing complex multi-step processes with checkpointing

### Security Engineering
- **Cryptographic Verification**: HMAC signature validation with timing attack prevention
- **Sandbox Isolation**: Container-based execution of untrusted code
- **Defense in Depth**: Multiple security layers at every level

### AI/ML Engineering
- **Multi-Agent Systems**: Coordinated AI agents with specialized roles
- **Prompt Engineering**: Optimized prompts for code generation and analysis
- **RAG Implementation**: Vector database for contextual code understanding

### DevOps & Infrastructure
- **Container Orchestration**: Docker and Docker Compose for environment management
- **CI/CD Integration**: GitHub Actions for automated testing and deployment
- **Observability**: Logging, monitoring, and health checks

### Async & Concurrent Programming
- **Job Queues**: BullMQ for reliable background processing
- **State Management**: Handling long-running agentic tasks
- **Error Handling**: Graceful degradation and retry strategies

---

## Contributing

Contributions are welcome! This project is structured for collaborative development:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Guidelines

- Follow ESLint/Prettier configurations for JavaScript
- Use Black and isort for Python code formatting
- Write tests for all new features
- Update documentation for API changes
- Ensure Docker builds pass before submitting PR

---

## Documentation

- [Technical Specification](./docs/technical-spec.md) - Detailed system design
- [API Reference](./docs/api-reference.md) - Webhook and agent APIs
- [Agent Architecture](./docs/agent-architecture.md) - LangGraph workflow details
- [Security Model](./docs/security-model.md) - Security considerations and threat model
- [Deployment Guide](./docs/deployment.md) - Production deployment instructions

---

## Roadmap

### Phase 1: Core Infrastructure (Current)
- [x] Webhook service with signature verification
- [x] Job queue with Redis and BullMQ
- [x] Docker development environment
- [x] Basic testing framework

### Phase 2: Agent System (Q2 2026)
- [ ] LangGraph supervisor implementation
- [ ] Four specialized agents (Triage, Researcher, Mechanic, Validator)
- [ ] Claude API integration
- [ ] Basic self-correction loop

### Phase 3: Advanced Features (Q3 2026)
- [ ] RAG system with PostgreSQL + pgvector
- [ ] Advanced Docker sandbox with resource limits
- [ ] GitHub PR automation with detailed reports
- [ ] Web UI dashboard for monitoring

### Phase 4: Production Hardening (Q4 2026)
- [ ] Kubernetes deployment configuration
- [ ] Comprehensive monitoring and alerting
- [ ] Performance optimization
- [ ] Security audit and penetration testing

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- **Anthropic** for Claude API and excellent documentation
- **LangChain/LangGraph** for agent orchestration framework
- **BullMQ** for robust job queue implementation
- **Semgrep** for security analysis tooling

---

## Contact

**Bryan** - [@bryan3342](https://github.com/bryan3342)

**Project Link**: [https://github.com/bryan3342/security-sentinel](https://github.com/bryan3342/security-sentinel)

---

