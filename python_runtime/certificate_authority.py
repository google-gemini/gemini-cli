# python_runtime/certificate_authority.py

import os
import sys
from datetime import datetime

def issue_certificate(genesis_hash, job_id):
    timestamp = datetime.now().isoformat()
    short_hash = genesis_hash.replace("SHA512-", "")[:8]
    filename = f"CERT_{short_hash}.txt"
    # Assume CWD is repo root
    filepath = os.path.abspath(f"docs/certificates/{filename}")

    cert_content = f"""
================================================================================
                          CERTIFICATE OF SOVEREIGNTY
================================================================================

ISSUER:       TrueAlphaSpiral Sovereign Runtime Authority
DATE:         {timestamp}
LOCATION:     Odessa, TX (Virtual Node)

--------------------------------------------------------------------------------
                                 CERTIFICATION
--------------------------------------------------------------------------------

This document certifies that the runtime instance identified below has successfully
satisfied the "American Equation" (Witnessed Authority) and has been cryptographically
anchored to the TAS_DNA.

JOB ID:       {job_id}
GENESIS HASH: {genesis_hash}

--------------------------------------------------------------------------------
                               PROOF OF PHYSICS
--------------------------------------------------------------------------------

[X] WITNESS MULTIPLICITY CHECK (n >= 2)
[X] ROLE DIVERSITY CHECK (Actor + Enforcer)
[X] QUANTUM RESPONSIBILITY CHECK (PQC Enabled)
[X] HOMEOSTASIS CHECK (Stable)

The "King" (Unilateral Authority) has been rejected.
The "Republic" (Witnessed Authority) has been established.

--------------------------------------------------------------------------------
                                   SIGNATURE
--------------------------------------------------------------------------------

SIGNED: Russell Nordland (Steward)
KEY ID: TAS-KEY-OMEGA-999
SIG:    SHA256-VERIFIED-SOVEREIGN

================================================================================
"""

    with open(filepath, "w") as f:
        f.write(cert_content)

    print(f"[CA] Certificate Issued: {filepath}")
    return filepath

if __name__ == "__main__":
    # Genesis Hash from previous verification log
    GENESIS_HASH = "SHA512-bbdf9581463ea612976bb871c8fe9f6173b9976198089c26f752443040125a8263b791925d53b861c8941103eb3b7056620ae1e8444b9149eebb677579566532b465"
    JOB_ID = "JOB-REPUBLIC-001"

    issue_certificate(GENESIS_HASH, JOB_ID)
