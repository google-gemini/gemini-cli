# Network Architecture & Troubleshooting Research

This document captures the empirical research and final configuration settled upon for the Gemini CLI Workspace system, specifically addressing the challenges of connecting from corporate environments to private GCP workers.

## 🔍 The Challenge
The goal was to achieve **Direct internal SSH** access to GCE workers that have **no public IP addresses**, allowing for high-performance file synchronization (`rsync`) and interactive sessions without the overhead of `gcloud` wrappers.

## 🧪 What Was Tested

### 1. Standard Internal DNS (`<instance>.<zone>.c.<project>.internal`)
- **Result**: ❌ FAILED
- **Observation**: Standard GCE internal DNS suffixes often fail to resolve or route correctly from local workstations in certain corporate environments, even when VPN/Peering is active.

### 2. IAP Tunneling (`gcloud compute ssh --tunnel-through-iap`)
- **Result**: ⚠️ INCONSISTENT
- **Observation**: While IAP is the standard fallback for private VMs, it failed with "failed to connect to backend" (4003) when the underlying VPC network lacked proper configuration or when firewall rules were misaligned with the specific network interface.

### 3. Custom "Auto" Networks
- **Result**: ❌ FAILED
- **Observation**: Creating a fresh VPC with default "auto" settings was insufficient. The "magic" corporate routing paths did not automatically extend to these new, isolated networks.

## ✅ The Final State (The "Magic" Configuration)

Through comparison with the working `gemini-cli-team-quota` project and empirical testing in a sandbox, we settled on the following requirements:

### 1. Hostname Construction
The system **MUST** use the following specific hostname pattern for direct internal reachability:
`nic0.<instance>.<zone>.c.<project>.internal.gcpnode.com`

### 2. VPC Configuration
The VPC (e.g., `iap-vpc`) must be a **Custom Mode** network with the following properties:
- **Private Google Access**: MUST be enabled on the subnetwork. This allows the private VM to communicate with Google services (like Artifact Registry) without a public IP.
- **Firewall Rule**: An ingress rule allowing `tcp:22` from `0.0.0.0/0`.
    - *Note*: While `0.0.0.0/0` seems broad, in this context it is typically restricted by the corporate-level gateway/peering that provides the `internal.gcpnode.com` route.

### 3. Worker Provider Abstraction
To manage this complexity, we implemented a `WorkerProvider` architecture:
- **`BaseProvider`**: Defines a common interface for `exec`, `sync`, and `provision`.
- **`GceCosProvider`**: Encapsulates the GCE-specific "magic" (hostname construction, IAP fallbacks, COS startup scripts).

## 🛠️ Why This Works
This configuration aligns with the **Google Corporate Direct-Access** pattern. By using the `nic0` prefix and the `.gcpnode.com` suffix, the connection is routed through internal corporate proxies that recognize the authenticated developer identity and permit the direct SSH handshake to the private IP.

## 📜 Technical Metadata Summary
- **Network**: `iap-vpc` (Custom)
- **Subnet**: `iap-subnet` (Private Google Access: Enabled)
- **Identity**: OS Login (`enable-oslogin=TRUE`)
- **Image**: Container-Optimized OS (COS)
- **Connectivity**: Direct SSH via `nic0` -> Automatic Fallback to IAP.
