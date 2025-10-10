#!/usr/bin/env python3
"""
CTI Report Parser with MITRE ATT&CK Mapping

Parses cyber threat intelligence reports and extracts TTPs (Tactics, Techniques, Procedures)
for automated breach attack simulation.

Based on Jake Williams' work building autonomous agents for breach attack simulation
from CTI reports.

Key features:
- Extract TTPs from narrative threat reports
- Map techniques to MITRE ATT&CK framework
- Generate executable attack sequences
- Identify detection opportunities
- Create BAS (Breach Attack Simulation) playbooks
"""

import re
import json
import hashlib
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field, asdict
from enum import Enum


class TTPPhase(Enum):
    """MITRE ATT&CK Tactic phases"""
    RECONNAISSANCE = "reconnaissance"
    RESOURCE_DEVELOPMENT = "resource_development"
    INITIAL_ACCESS = "initial_access"
    EXECUTION = "execution"
    PERSISTENCE = "persistence"
    PRIVILEGE_ESCALATION = "privilege_escalation"
    DEFENSE_EVASION = "defense_evasion"
    CREDENTIAL_ACCESS = "credential_access"
    DISCOVERY = "discovery"
    LATERAL_MOVEMENT = "lateral_movement"
    COLLECTION = "collection"
    COMMAND_AND_CONTROL = "command_and_control"
    EXFILTRATION = "exfiltration"
    IMPACT = "impact"


@dataclass
class MITRETechnique:
    """MITRE ATT&CK technique"""
    technique_id: str  # T1566, T1059.001
    technique_name: str
    tactic: TTPPhase
    description: str
    detection_methods: List[str] = field(default_factory=list)
    data_sources: List[str] = field(default_factory=list)
    platforms: List[str] = field(default_factory=list)
    defenses_bypassed: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict:
        data = asdict(self)
        data['tactic'] = self.tactic.value
        return data


@dataclass
class ExtractedTTP:
    """TTP extracted from CTI report"""
    ttp_id: str
    mitre_technique_id: str
    technique_name: str
    tactic: TTPPhase
    confidence: float  # 0.0 - 1.0
    evidence_text: str
    context: str = ""
    sequence_order: int = 0

    def to_dict(self) -> Dict:
        data = asdict(self)
        data['tactic'] = self.tactic.value
        return data


@dataclass
class AttackSequence:
    """Ordered sequence of TTPs forming attack chain"""
    sequence_id: str
    name: str
    ttps: List[ExtractedTTP] = field(default_factory=list)
    entry_point: str = ""
    objective: str = ""
    estimated_duration: str = ""

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class CTIReport:
    """Parsed CTI report"""
    report_id: str
    title: str
    date_published: str
    threat_actor: str
    report_text: str

    # Extracted data
    ttps: List[ExtractedTTP] = field(default_factory=list)
    attack_sequences: List[AttackSequence] = field(default_factory=list)
    iocs: Dict[str, List[str]] = field(default_factory=dict)

    # Metadata
    parsing_confidence: float = 0.0
    extraction_date: str = ""

    def calculate_hash(self) -> str:
        """Generate report hash"""
        content = f"{self.title}{self.date_published}{self.threat_actor}"
        return hashlib.sha256(content.encode()).hexdigest()[:16]

    def to_dict(self) -> Dict:
        return asdict(self)


class MITREAttackLibrary:
    """Library of MITRE ATT&CK techniques"""

    def __init__(self):
        self.techniques: Dict[str, MITRETechnique] = {}
        self._build_technique_library()

    def _build_technique_library(self):
        """Build subset of MITRE ATT&CK techniques"""

        # Based on Shadow Brokers leaked tools and common APT TTPs
        techniques = [
            MITRETechnique(
                technique_id="T1190",
                technique_name="Exploit Public-Facing Application",
                tactic=TTPPhase.INITIAL_ACCESS,
                description="Exploit vulnerabilities in internet-facing systems (e.g., EternalBlue)",
                detection_methods=[
                    "Network intrusion detection",
                    "Application logging",
                    "Vulnerability scanning"
                ],
                data_sources=["Network Traffic", "Application Logs"],
                platforms=["Windows", "Linux", "macOS"],
                defenses_bypassed=["Firewall"]
            ),
            MITRETechnique(
                technique_id="T1566.001",
                technique_name="Phishing: Spearphishing Attachment",
                tactic=TTPPhase.INITIAL_ACCESS,
                description="Send targeted emails with malicious attachments",
                detection_methods=[
                    "Email gateway filtering",
                    "User awareness training",
                    "Attachment sandboxing"
                ],
                data_sources=["Email Gateway", "File Monitoring"],
                platforms=["Windows", "macOS", "Linux"],
                defenses_bypassed=[]
            ),
            MITRETechnique(
                technique_id="T1059.001",
                technique_name="Command and Scripting Interpreter: PowerShell",
                tactic=TTPPhase.EXECUTION,
                description="Execute PowerShell commands for malicious purposes",
                detection_methods=[
                    "PowerShell logging",
                    "Script block logging",
                    "Behavioral detection"
                ],
                data_sources=["Process Monitoring", "PowerShell Logs"],
                platforms=["Windows"],
                defenses_bypassed=["Application Control"]
            ),
            MITRETechnique(
                technique_id="T1059.003",
                technique_name="Command and Scripting Interpreter: Windows Command Shell",
                tactic=TTPPhase.EXECUTION,
                description="Execute cmd.exe commands",
                detection_methods=[
                    "Process monitoring",
                    "Command-line logging"
                ],
                data_sources=["Process Monitoring", "Command Execution"],
                platforms=["Windows"],
                defenses_bypassed=[]
            ),
            MITRETechnique(
                technique_id="T1003.001",
                technique_name="OS Credential Dumping: LSASS Memory",
                tactic=TTPPhase.CREDENTIAL_ACCESS,
                description="Dump credentials from LSASS process memory",
                detection_methods=[
                    "LSASS process protection",
                    "Memory access monitoring",
                    "Credential Guard"
                ],
                data_sources=["Process Monitoring", "API Monitoring"],
                platforms=["Windows"],
                defenses_bypassed=[]
            ),
            MITRETechnique(
                technique_id="T1071.001",
                technique_name="Application Layer Protocol: Web Protocols",
                tactic=TTPPhase.COMMAND_AND_CONTROL,
                description="Use HTTP/HTTPS for C2 communication",
                detection_methods=[
                    "Network traffic analysis",
                    "TLS inspection",
                    "Behavioral analysis"
                ],
                data_sources=["Network Traffic", "Netflow"],
                platforms=["Windows", "Linux", "macOS"],
                defenses_bypassed=["Firewall"]
            ),
            MITRETechnique(
                technique_id="T1041",
                technique_name="Exfiltration Over C2 Channel",
                tactic=TTPPhase.EXFILTRATION,
                description="Exfiltrate data using established C2 channel",
                detection_methods=[
                    "Network traffic analysis",
                    "Data loss prevention",
                    "Anomaly detection"
                ],
                data_sources=["Network Traffic", "Netflow"],
                platforms=["Windows", "Linux", "macOS"],
                defenses_bypassed=[]
            ),
            MITRETechnique(
                technique_id="T1486",
                technique_name="Data Encrypted for Impact",
                tactic=TTPPhase.IMPACT,
                description="Encrypt data to disrupt availability (ransomware)",
                detection_methods=[
                    "File system monitoring",
                    "Process monitoring",
                    "Behavioral detection"
                ],
                data_sources=["File Monitoring", "Process Monitoring"],
                platforms=["Windows", "Linux", "macOS"],
                defenses_bypassed=[]
            ),
            MITRETechnique(
                technique_id="T1133",
                technique_name="External Remote Services",
                tactic=TTPPhase.INITIAL_ACCESS,
                description="Use legitimate external remote services (VPN, RDP)",
                detection_methods=[
                    "Multi-factor authentication",
                    "Login monitoring",
                    "Geo-location analysis"
                ],
                data_sources=["Authentication Logs", "Network Traffic"],
                platforms=["Windows", "Linux", "macOS"],
                defenses_bypassed=["Firewall"]
            ),
            MITRETechnique(
                technique_id="T1021.001",
                technique_name="Remote Services: Remote Desktop Protocol",
                tactic=TTPPhase.LATERAL_MOVEMENT,
                description="Use RDP for lateral movement",
                detection_methods=[
                    "Network monitoring",
                    "Login monitoring",
                    "Behavioral analysis"
                ],
                data_sources=["Authentication Logs", "Network Traffic"],
                platforms=["Windows"],
                defenses_bypassed=[]
            ),
        ]

        for technique in techniques:
            self.techniques[technique.technique_id] = technique

    def get_technique(self, technique_id: str) -> Optional[MITRETechnique]:
        """Retrieve technique by ID"""
        return self.techniques.get(technique_id)

    def search_by_name(self, keyword: str) -> List[MITRETechnique]:
        """Search techniques by keyword"""
        results = []
        keyword_lower = keyword.lower()
        for technique in self.techniques.values():
            if keyword_lower in technique.technique_name.lower():
                results.append(technique)
        return results


class CTIReportParser:
    """Parse CTI reports and extract TTPs"""

    def __init__(self):
        self.mitre_library = MITREAttackLibrary()
        self.technique_patterns = self._build_extraction_patterns()

    def _build_extraction_patterns(self) -> Dict[str, List[str]]:
        """Build regex patterns for TTP extraction"""

        patterns = {
            'T1190': [
                r'exploit(?:ed|ing)?\s+(?:a\s+)?(?:public-facing|internet-facing|web)\s+(?:application|server|service)',
                r'EternalBlue',
                r'SMB\s+exploit',
                r'CVE-\d{4}-\d{4,7}'
            ],
            'T1566.001': [
                r'spearphish(?:ing)?\s+(?:attack|campaign|email)',
                r'malicious\s+attachment',
                r'phishing\s+email',
                r'weaponized\s+(?:document|attachment)'
            ],
            'T1059.001': [
                r'PowerShell\s+(?:script|command|execution)',
                r'ps1\s+(?:script|file)',
                r'encoded\s+PowerShell',
                r'Invoke-'
            ],
            'T1059.003': [
                r'cmd\.exe',
                r'command\s+shell',
                r'batch\s+script'
            ],
            'T1003.001': [
                r'dump(?:ed|ing)?\s+(?:LSASS|credentials)',
                r'Mimikatz',
                r'credential\s+(?:theft|harvesting|dumping)',
                r'LSASS\s+memory'
            ],
            'T1071.001': [
                r'HTTP(?:S)?\s+(?:C2|command\s+and\s+control|beaconing)',
                r'web-based\s+C2',
                r'HTTPS\s+communication'
            ],
            'T1041': [
                r'exfiltrat(?:e|ed|ing)\s+(?:data|files)',
                r'data\s+theft',
                r'steal(?:ing)?\s+(?:data|information)'
            ],
            'T1486': [
                r'ransomware',
                r'encrypt(?:ed|ing)?\s+(?:files|data)',
                r'WannaCry',
                r'NotPetya'
            ],
            'T1133': [
                r'VPN\s+(?:access|compromise)',
                r'remote\s+access\s+(?:service|tool)',
                r'legitimate\s+remote\s+service'
            ],
            'T1021.001': [
                r'RDP\s+(?:connection|access|compromise)',
                r'Remote\s+Desktop\s+Protocol',
                r'lateral\s+movement\s+via\s+RDP'
            ],
        }

        return patterns

    def extract_ttps(self, report: CTIReport) -> List[ExtractedTTP]:
        """Extract TTPs from report text"""

        extracted_ttps = []
        text = report.report_text.lower()

        for technique_id, patterns in self.technique_patterns.items():
            for pattern in patterns:
                matches = re.finditer(pattern, text, re.IGNORECASE)
                for match in matches:
                    # Get context around match
                    start = max(0, match.start() - 100)
                    end = min(len(text), match.end() + 100)
                    context = report.report_text[start:end]

                    # Get MITRE technique info
                    mitre_tech = self.mitre_library.get_technique(technique_id)
                    if not mitre_tech:
                        continue

                    # Calculate confidence based on pattern specificity
                    confidence = 0.8 if len(pattern) > 20 else 0.6

                    ttp = ExtractedTTP(
                        ttp_id=f"TTP-{len(extracted_ttps) + 1:03d}",
                        mitre_technique_id=technique_id,
                        technique_name=mitre_tech.technique_name,
                        tactic=mitre_tech.tactic,
                        confidence=confidence,
                        evidence_text=match.group(0),
                        context=context.strip(),
                        sequence_order=0  # Will be updated later
                    )

                    extracted_ttps.append(ttp)

        # Deduplicate
        unique_ttps = self._deduplicate_ttps(extracted_ttps)

        # Order by likely sequence
        ordered_ttps = self._order_attack_sequence(unique_ttps)

        return ordered_ttps

    def _deduplicate_ttps(self, ttps: List[ExtractedTTP]) -> List[ExtractedTTP]:
        """Remove duplicate TTPs"""
        seen = set()
        unique = []

        for ttp in ttps:
            if ttp.mitre_technique_id not in seen:
                seen.add(ttp.mitre_technique_id)
                unique.append(ttp)

        return unique

    def _order_attack_sequence(self, ttps: List[ExtractedTTP]) -> List[ExtractedTTP]:
        """Order TTPs by attack kill chain"""

        # MITRE ATT&CK tactic order
        tactic_order = {
            TTPPhase.RECONNAISSANCE: 1,
            TTPPhase.RESOURCE_DEVELOPMENT: 2,
            TTPPhase.INITIAL_ACCESS: 3,
            TTPPhase.EXECUTION: 4,
            TTPPhase.PERSISTENCE: 5,
            TTPPhase.PRIVILEGE_ESCALATION: 6,
            TTPPhase.DEFENSE_EVASION: 7,
            TTPPhase.CREDENTIAL_ACCESS: 8,
            TTPPhase.DISCOVERY: 9,
            TTPPhase.LATERAL_MOVEMENT: 10,
            TTPPhase.COLLECTION: 11,
            TTPPhase.COMMAND_AND_CONTROL: 12,
            TTPPhase.EXFILTRATION: 13,
            TTPPhase.IMPACT: 14
        }

        # Sort by tactic
        sorted_ttps = sorted(ttps, key=lambda t: tactic_order.get(t.tactic, 99))

        # Update sequence order
        for i, ttp in enumerate(sorted_ttps, 1):
            ttp.sequence_order = i

        return sorted_ttps

    def build_attack_sequence(self, report: CTIReport, ttps: List[ExtractedTTP]) -> AttackSequence:
        """Build executable attack sequence from TTPs"""

        sequence = AttackSequence(
            sequence_id=f"SEQ-{report.calculate_hash()[:8]}",
            name=f"{report.threat_actor} Attack Chain",
            ttps=ttps,
            entry_point=ttps[0].technique_name if ttps else "Unknown",
            objective=self._infer_objective(ttps),
            estimated_duration=self._estimate_duration(ttps)
        )

        return sequence

    def _infer_objective(self, ttps: List[ExtractedTTP]) -> str:
        """Infer attack objective from TTPs"""

        # Check for impact techniques
        impact_ttps = [t for t in ttps if t.tactic == TTPPhase.IMPACT]
        if any('ransomware' in t.technique_name.lower() or 'encrypt' in t.technique_name.lower()
               for t in impact_ttps):
            return "Ransomware deployment"

        exfil_ttps = [t for t in ttps if t.tactic == TTPPhase.EXFILTRATION]
        if exfil_ttps:
            return "Data exfiltration / Espionage"

        cred_ttps = [t for t in ttps if t.tactic == TTPPhase.CREDENTIAL_ACCESS]
        if cred_ttps:
            return "Credential harvesting"

        return "Unknown objective"

    def _estimate_duration(self, ttps: List[ExtractedTTP]) -> str:
        """Estimate attack duration based on TTP count"""

        if len(ttps) <= 3:
            return "< 1 hour"
        elif len(ttps) <= 6:
            return "1-24 hours"
        elif len(ttps) <= 10:
            return "1-7 days"
        else:
            return "> 1 week"

    def parse_report(self, report_text: str, title: str = "", threat_actor: str = "") -> CTIReport:
        """Parse full CTI report"""

        report = CTIReport(
            report_id=f"RPT-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            title=title or "Untitled Report",
            date_published=datetime.now().isoformat(),
            threat_actor=threat_actor or "Unknown",
            report_text=report_text,
            extraction_date=datetime.now().isoformat()
        )

        # Extract TTPs
        ttps = self.extract_ttps(report)
        report.ttps = ttps

        # Build attack sequence
        if ttps:
            sequence = self.build_attack_sequence(report, ttps)
            report.attack_sequences.append(sequence)

        # Calculate parsing confidence
        report.parsing_confidence = min(1.0, len(ttps) * 0.15)

        return report

    def generate_bas_playbook(self, sequence: AttackSequence) -> Dict[str, Any]:
        """Generate Breach Attack Simulation playbook"""

        playbook = {
            'playbook_id': f"BAS-{sequence.sequence_id}",
            'name': sequence.name,
            'objective': sequence.objective,
            'estimated_duration': sequence.estimated_duration,
            'steps': []
        }

        for ttp in sequence.ttps:
            mitre_tech = self.mitre_library.get_technique(ttp.mitre_technique_id)

            step = {
                'step_number': ttp.sequence_order,
                'technique_id': ttp.mitre_technique_id,
                'technique_name': ttp.technique_name,
                'tactic': ttp.tactic.value,
                'description': mitre_tech.description if mitre_tech else "",
                'platforms': mitre_tech.platforms if mitre_tech else [],
                'detection_methods': mitre_tech.detection_methods if mitre_tech else [],
                'data_sources': mitre_tech.data_sources if mitre_tech else [],
                'simulation_command': self._generate_simulation_command(ttp),
                'expected_detections': mitre_tech.detection_methods if mitre_tech else []
            }

            playbook['steps'].append(step)

        return playbook

    def _generate_simulation_command(self, ttp: ExtractedTTP) -> str:
        """Generate simulation command for TTP (placeholder)"""

        # In real implementation, this would generate actual commands
        # For now, return placeholder
        return f"# Simulate {ttp.technique_name}\n# MITRE: {ttp.mitre_technique_id}"

    def export_analysis(self, report: CTIReport, filename: str = "cti_report_analysis.json"):
        """Export parsed report to JSON"""

        export_data = {
            'generated': datetime.now().isoformat(),
            'parser': 'CTI Report Parser with MITRE ATT&CK',
            'report': report.to_dict(),
            'mitre_mapping': []
        }

        # Add MITRE technique details
        for ttp in report.ttps:
            mitre_tech = self.mitre_library.get_technique(ttp.mitre_technique_id)
            if mitre_tech:
                export_data['mitre_mapping'].append(mitre_tech.to_dict())

        # Add BAS playbooks
        export_data['bas_playbooks'] = []
        for sequence in report.attack_sequences:
            playbook = self.generate_bas_playbook(sequence)
            export_data['bas_playbooks'].append(playbook)

        with open(filename, 'w') as f:
            json.dump(export_data, f, indent=2)

        print(f"[+] Exported CTI analysis to {filename}")
        return filename


def main():
    """Demo: CTI report parsing"""
    print("=" * 80)
    print("CTI REPORT PARSER WITH MITRE ATT&CK MAPPING")
    print("=" * 80)
    print()
    print("Automated TTP extraction for breach attack simulation")
    print("Based on Jake Williams' autonomous agent research")
    print()

    # Sample CTI report (Shadow Brokers / WannaCry themed)
    sample_report = """
    THREAT INTELLIGENCE REPORT: WannaCry Ransomware Campaign

    Date: May 12, 2017
    Threat Actor: Unknown (suspected LAZARUS GROUP with leaked NSA tools)

    EXECUTIVE SUMMARY:
    A global ransomware campaign exploiting the EternalBlue SMB vulnerability (CVE-2017-0144)
    has infected over 200,000 systems across 150 countries. The attack leverages a leaked NSA
    exploit to gain initial access, then deploys ransomware to encrypt files for financial gain.

    ATTACK CHAIN:

    1. INITIAL ACCESS: The threat actor exploited internet-facing Windows systems using the
       EternalBlue exploit targeting SMB protocol. This vulnerability was patched by Microsoft
       in March 2017 (MS17-010) but many systems remained unpatched.

    2. EXECUTION: Upon successful exploitation, the malware executed PowerShell scripts and
       cmd.exe commands to download additional payloads and establish persistence.

    3. CREDENTIAL ACCESS: The malware attempted to dump credentials from LSASS memory using
       techniques similar to Mimikatz for potential lateral movement.

    4. LATERAL MOVEMENT: Using stolen credentials, the ransomware spread to other systems via
       RDP connections and SMB shares within the network.

    5. COMMAND AND CONTROL: The malware established HTTPS-based C2 communication with
       attacker-controlled servers for command execution and configuration updates.

    6. IMPACT: The ransomware encrypted user files with strong encryption, rendering them
       inaccessible. A ransom note demanded $300-600 in Bitcoin for decryption.

    DETECTION OPPORTUNITIES:
    - Network monitoring for SMB exploitation attempts
    - PowerShell logging and execution monitoring
    - LSASS process access monitoring
    - Unusual RDP connections between workstations
    - File encryption behavioral detection
    - C2 HTTPS beaconing pattern analysis

    RECOMMENDATIONS:
    - Apply MS17-010 patch immediately
    - Enable PowerShell script block logging
    - Implement credential guard
    - Segment networks to prevent lateral movement
    - Deploy behavioral ransomware detection
    """

    # Initialize parser
    parser = CTIReportParser()

    print("[+] Parsing CTI report...")
    print()

    # Parse report
    report = parser.parse_report(
        report_text=sample_report,
        title="WannaCry Ransomware Campaign Analysis",
        threat_actor="LAZARUS GROUP (suspected)"
    )

    print(f"Report ID: {report.report_id}")
    print(f"Report Hash: {report.calculate_hash()}")
    print(f"Parsing Confidence: {report.parsing_confidence * 100:.1f}%")
    print()

    # Display extracted TTPs
    print("=" * 80)
    print("EXTRACTED TTPs")
    print("=" * 80)
    print()

    print(f"Total TTPs Extracted: {len(report.ttps)}")
    print()

    for ttp in report.ttps:
        print(f"[{ttp.sequence_order}] {ttp.mitre_technique_id}: {ttp.technique_name}")
        print(f"    Tactic: {ttp.tactic.value}")
        print(f"    Confidence: {ttp.confidence * 100:.0f}%")
        print(f"    Evidence: \"{ttp.evidence_text}\"")
        print()

    # Display attack sequence
    print("=" * 80)
    print("ATTACK SEQUENCE")
    print("=" * 80)
    print()

    if report.attack_sequences:
        sequence = report.attack_sequences[0]
        print(f"Sequence ID: {sequence.sequence_id}")
        print(f"Name: {sequence.name}")
        print(f"Entry Point: {sequence.entry_point}")
        print(f"Objective: {sequence.objective}")
        print(f"Estimated Duration: {sequence.estimated_duration}")
        print()

        print("Kill Chain:")
        for ttp in sequence.ttps:
            print(f"  {ttp.sequence_order}. [{ttp.mitre_technique_id}] {ttp.technique_name}")
        print()

    # Generate BAS playbook
    print("=" * 80)
    print("BREACH ATTACK SIMULATION PLAYBOOK")
    print("=" * 80)
    print()

    if report.attack_sequences:
        playbook = parser.generate_bas_playbook(report.attack_sequences[0])
        print(f"Playbook ID: {playbook['playbook_id']}")
        print(f"Name: {playbook['name']}")
        print(f"Objective: {playbook['objective']}")
        print()

        print("Simulation Steps:")
        for step in playbook['steps']:
            print(f"\nStep {step['step_number']}: {step['technique_name']}")
            print(f"  MITRE: {step['technique_id']}")
            print(f"  Tactic: {step['tactic']}")
            print(f"  Platforms: {', '.join(step['platforms'])}")
            print(f"  Detection Methods:")
            for method in step['detection_methods']:
                print(f"    - {method}")
            print(f"  Data Sources:")
            for source in step['data_sources']:
                print(f"    - {source}")
        print()

    # Export
    print("=" * 80)
    print("EXPORTING ANALYSIS")
    print("=" * 80)
    print()

    parser.export_analysis(report, "cti_report_analysis.json")

    print()
    print("=" * 80)
    print("PARSING COMPLETE")
    print("=" * 80)
    print()
    print("Key Takeaways:")
    print("  - Automated TTP extraction from narrative reports")
    print("  - MITRE ATT&CK mapping for standardized technique classification")
    print("  - Attack sequence ordering by kill chain phase")
    print("  - BAS playbook generation for automated testing")
    print("  - Detection opportunity identification for blue team")
    print()


if __name__ == "__main__":
    main()
