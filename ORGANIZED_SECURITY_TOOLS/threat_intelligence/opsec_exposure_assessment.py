#!/usr/bin/env python3
"""
OPSEC Exposure Assessment Tool

Evaluates operational security exposure risks for intelligence operators and security researchers.
Based on Jake Williams' experience being outed by Shadow Brokers.

Assessment areas:
- Public digital footprint
- Attribution surface area
- Cover term exposure
- Identity correlation risks
- Operational history visibility
"""

import json
import hashlib
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field, asdict
from enum import Enum


class ExposureType(Enum):
    """Types of OPSEC exposures"""
    IDENTITY = "identity"
    OPERATIONAL_HISTORY = "operational_history"
    COVER_TERMS = "cover_terms"
    TECHNICAL_ATTRIBUTION = "technical_attribution"
    SOCIAL_CORRELATION = "social_correlation"
    TRAVEL_PATTERNS = "travel_patterns"
    PROFESSIONAL_NETWORK = "professional_network"


class RiskLevel(Enum):
    """Risk severity levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class MitigationStatus(Enum):
    """Whether exposure can be mitigated"""
    MITIGATABLE = "mitigatable"
    PARTIALLY_MITIGATABLE = "partially_mitigatable"
    PERMANENT = "permanent"


@dataclass
class ExposureVector:
    """Individual exposure vector"""
    vector_id: str
    exposure_type: ExposureType
    description: str
    risk_level: RiskLevel
    mitigation_status: MitigationStatus
    affected_operations: int
    mitigation_steps: List[str] = field(default_factory=list)
    notes: str = ""

    def to_dict(self) -> Dict:
        data = asdict(self)
        data['exposure_type'] = self.exposure_type.value
        data['risk_level'] = self.risk_level.value
        data['mitigation_status'] = self.mitigation_status.value
        return data


@dataclass
class OperatorProfile:
    """Operator/researcher profile for OPSEC assessment"""
    operator_id: str
    name: str
    cover_identity: Optional[str] = None
    current_role: str = ""
    previous_roles: List[str] = field(default_factory=list)

    # Digital footprint
    public_social_media: bool = False
    professional_publications: int = 0
    conference_appearances: int = 0
    media_interviews: int = 0

    # Operational history
    years_in_intelligence: int = 0
    known_operations: int = 0
    classified_operations: int = 0

    # Exposure vectors
    exposures: List[ExposureVector] = field(default_factory=list)

    # Travel risk
    high_risk_countries: List[str] = field(default_factory=list)
    travel_restrictions: List[str] = field(default_factory=list)

    def calculate_exposure_score(self) -> float:
        """Calculate overall exposure score (0-100)"""
        if not self.exposures:
            return 0.0

        risk_weights = {
            RiskLevel.LOW: 1.0,
            RiskLevel.MEDIUM: 2.5,
            RiskLevel.HIGH: 5.0,
            RiskLevel.CRITICAL: 10.0
        }

        total_risk = sum(risk_weights[exp.risk_level] for exp in self.exposures)
        max_possible = len(self.exposures) * risk_weights[RiskLevel.CRITICAL]

        return (total_risk / max_possible) * 100 if max_possible > 0 else 0.0

    def to_dict(self) -> Dict:
        data = asdict(self)
        data['exposure_score'] = self.calculate_exposure_score()
        return data


@dataclass
class OPSECIncident:
    """OPSEC compromise incident"""
    incident_id: str
    incident_date: str
    incident_type: str
    operator_id: str
    description: str
    exposures_revealed: List[str]
    impact: RiskLevel
    attribution_source: str
    immediate_actions: List[str] = field(default_factory=list)
    long_term_consequences: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict:
        data = asdict(self)
        data['impact'] = self.impact.value
        return data


class OPSECAssessmentFramework:
    """Framework for assessing operator OPSEC exposure"""

    def __init__(self):
        self.operators: List[OperatorProfile] = []
        self.incidents: List[OPSECIncident] = []
        self._build_jake_williams_case_study()

    def _build_jake_williams_case_study(self):
        """Build Jake Williams OPSEC exposure case study"""

        # Jake Williams' exposure vectors
        exposures = [
            ExposureVector(
                vector_id="EXP-JW-001",
                exposure_type=ExposureType.IDENTITY,
                description="Publicly named by Shadow Brokers as former NSA TAO operator",
                risk_level=RiskLevel.CRITICAL,
                mitigation_status=MitigationStatus.PERMANENT,
                affected_operations=0,
                mitigation_steps=[],
                notes="Cannot undo public attribution, identity permanently associated with NSA TAO"
            ),
            ExposureVector(
                vector_id="EXP-JW-002",
                exposure_type=ExposureType.OPERATIONAL_HISTORY,
                description="Shadow Brokers demonstrated intimate knowledge of TAO operations",
                risk_level=RiskLevel.CRITICAL,
                mitigation_status=MitigationStatus.PERMANENT,
                affected_operations=100,
                mitigation_steps=[],
                notes="Historical operations cannot be uncompromised, affected all operations from 2009-2013"
            ),
            ExposureVector(
                vector_id="EXP-JW-003",
                exposure_type=ExposureType.COVER_TERMS,
                description="Cover terms and operational nomenclature exposed in dumps",
                risk_level=RiskLevel.HIGH,
                mitigation_status=MitigationStatus.PERMANENT,
                affected_operations=50,
                mitigation_steps=[],
                notes="Cover terms revealed in context, cannot be retroactively changed"
            ),
            ExposureVector(
                vector_id="EXP-JW-004",
                exposure_type=ExposureType.PROFESSIONAL_NETWORK,
                description="Public security expert with consultancy, conference circuit presence",
                risk_level=RiskLevel.MEDIUM,
                mitigation_status=MitigationStatus.MITIGATABLE,
                affected_operations=0,
                mitigation_steps=[
                    "Limit public commentary on nation-state operations",
                    "Avoid detailed technical discussions of classified tools",
                    "Maintain professional distance from active operators"
                ],
                notes="Post-NSA career requires public visibility, creates tension with OPSEC"
            ),
            ExposureVector(
                vector_id="EXP-JW-005",
                exposure_type=ExposureType.TRAVEL_PATTERNS,
                description="Cannot safely travel to adversary nations",
                risk_level=RiskLevel.HIGH,
                mitigation_status=MitigationStatus.PARTIALLY_MITIGATABLE,
                affected_operations=0,
                mitigation_steps=[
                    "Avoid overflying Russia, China, Iran",
                    "Avoid connecting through Hong Kong",
                    "Never travel to high-risk countries",
                    "Plan routes avoiding potential forced landings"
                ],
                notes="Permanent travel restrictions to avoid arrest/detention risk"
            ),
            ExposureVector(
                vector_id="EXP-JW-006",
                exposure_type=ExposureType.SOCIAL_CORRELATION,
                description="Twitter/X presence correlating with Shadow Brokers analysis",
                risk_level=RiskLevel.MEDIUM,
                mitigation_status=MitigationStatus.MITIGATABLE,
                affected_operations=0,
                mitigation_steps=[
                    "Limit technical commentary on active leaks",
                    "Avoid being first to verify legitimacy",
                    "Don't correlate geopolitical events with leak timing publicly"
                ],
                notes="Social media activity drew Shadow Brokers attention, led to being named"
            ),
        ]

        # Create Jake Williams operator profile
        jake = OperatorProfile(
            operator_id="OP-JW-001",
            name="Jake Williams",
            cover_identity=None,  # Cover blown
            current_role="VP Research & Development, Hunter Strategy",
            previous_roles=[
                "NSA Tailored Access Operations (TAO) - Master CNE Operator",
                "18 years intelligence community",
                "Founded two cybersecurity consultancies"
            ],
            public_social_media=True,
            professional_publications=50,
            conference_appearances=20,
            media_interviews=10,
            years_in_intelligence=18,
            known_operations=0,  # Classified
            classified_operations=100,  # Estimate
            exposures=exposures,
            high_risk_countries=["Russia", "China", "Iran", "North Korea"],
            travel_restrictions=[
                "No overflight of Russia",
                "No overflight of China",
                "No connections through Hong Kong",
                "Avoid Middle East routing over Iran",
                "Emergency landing contingency planning required"
            ]
        )

        self.operators.append(jake)

        # Shadow Brokers outing incident
        incident = OPSECIncident(
            incident_id="INC-2017-001",
            incident_date="2017-04-14",
            incident_type="Public attribution by adversary",
            operator_id="OP-JW-001",
            description="Shadow Brokers publicly named Jake Williams as former NSA TAO operator in leak post",
            exposures_revealed=[
                "Identity as NSA TAO operator",
                "Operational knowledge of specific tools",
                "Association with Equation Group toolset",
                "Timeline of service (implied)"
            ],
            impact=RiskLevel.CRITICAL,
            attribution_source="Shadow Brokers leak post (April 14, 2017)",
            immediate_actions=[
                "Contact former NSA colleagues",
                "Notify current clients of exposure",
                "Assess travel safety implications",
                "Evaluate operational security posture",
                "Legal consultation regarding exposure"
            ],
            long_term_consequences=[
                "Permanent travel restrictions to adversary nations",
                "Cannot claim ignorance of NSA tools/methods in professional work",
                "Potential target for foreign intelligence recruitment/coercion",
                "Enhanced scrutiny on all public statements",
                "Reference point for other exposed operators"
            ]
        )

        self.incidents.append(incident)

    def assess_operator(self, operator: OperatorProfile) -> Dict[str, Any]:
        """Complete OPSEC assessment for operator"""

        exposure_score = operator.calculate_exposure_score()

        # Count exposures by type
        exposure_breakdown = {}
        for exp_type in ExposureType:
            count = len([e for e in operator.exposures if e.exposure_type == exp_type])
            if count > 0:
                exposure_breakdown[exp_type.value] = count

        # Count by risk level
        risk_breakdown = {}
        for risk in RiskLevel:
            count = len([e for e in operator.exposures if e.risk_level == risk])
            if count > 0:
                risk_breakdown[risk.value] = count

        # Count by mitigation status
        permanent_exposures = len([e for e in operator.exposures
                                   if e.mitigation_status == MitigationStatus.PERMANENT])
        mitigatable_exposures = len([e for e in operator.exposures
                                     if e.mitigation_status == MitigationStatus.MITIGATABLE])

        assessment = {
            'operator': operator.name,
            'operator_id': operator.operator_id,
            'current_role': operator.current_role,
            'exposure_score': round(exposure_score, 2),
            'total_exposures': len(operator.exposures),
            'exposure_breakdown': exposure_breakdown,
            'risk_breakdown': risk_breakdown,
            'permanent_exposures': permanent_exposures,
            'mitigatable_exposures': mitigatable_exposures,
            'high_risk_countries': len(operator.high_risk_countries),
            'travel_restrictions': len(operator.travel_restrictions),
            'recommendation': ''
        }

        # Generate recommendation
        if exposure_score >= 75:
            assessment['recommendation'] = (
                "CRITICAL EXPOSURE: Operator has severe OPSEC compromises with limited mitigation options. "
                f"{permanent_exposures} permanent exposures cannot be remediated. "
                "Recommend: (1) Accept permanent travel restrictions to adversary nations, "
                "(2) Minimize public technical commentary on classified operations, "
                "(3) Maintain professional OPSEC discipline in all communications, "
                "(4) Regular threat assessment updates for evolving risks."
            )
        elif exposure_score >= 50:
            assessment['recommendation'] = (
                "HIGH EXPOSURE: Significant OPSEC risks present. "
                f"{mitigatable_exposures} exposures can be mitigated through operational discipline. "
                "Recommend proactive mitigation and ongoing monitoring."
            )
        elif exposure_score >= 25:
            assessment['recommendation'] = (
                "MODERATE EXPOSURE: Manageable OPSEC risks. "
                "Implement recommended mitigation strategies and maintain awareness."
            )
        else:
            assessment['recommendation'] = (
                "LOW EXPOSURE: OPSEC posture acceptable. Continue current practices."
            )

        return assessment

    def analyze_incident(self, incident: OPSECIncident) -> Dict[str, Any]:
        """Analyze OPSEC incident"""

        analysis = {
            'incident': incident.incident_id,
            'date': incident.incident_date,
            'type': incident.incident_type,
            'impact': incident.impact.value,
            'exposures_revealed': len(incident.exposures_revealed),
            'immediate_actions_taken': len(incident.immediate_actions),
            'long_term_consequences': len(incident.long_term_consequences),
            'attribution_source': incident.attribution_source,
            'description': incident.description,
            'analysis': ''
        }

        if incident.impact == RiskLevel.CRITICAL:
            analysis['analysis'] = (
                f"CRITICAL INCIDENT: {incident.description}. "
                f"Revealed {len(incident.exposures_revealed)} distinct exposures. "
                f"{len(incident.immediate_actions)} immediate actions required. "
                f"{len(incident.long_term_consequences)} long-term consequences identified. "
                "This incident represents irreversible OPSEC failure with permanent impact."
            )

        return analysis

    def generate_mitigation_plan(self, operator: OperatorProfile) -> List[Dict[str, Any]]:
        """Generate prioritized mitigation plan"""

        # Group exposures by mitigation status
        mitigatable = [e for e in operator.exposures
                       if e.mitigation_status == MitigationStatus.MITIGATABLE]
        partial = [e for e in operator.exposures
                   if e.mitigation_status == MitigationStatus.PARTIALLY_MITIGATABLE]

        # Sort by risk level (highest first)
        risk_order = {RiskLevel.CRITICAL: 4, RiskLevel.HIGH: 3,
                      RiskLevel.MEDIUM: 2, RiskLevel.LOW: 1}

        all_mitigatable = sorted(mitigatable + partial,
                                 key=lambda x: risk_order[x.risk_level],
                                 reverse=True)

        mitigation_plan = []
        for i, exposure in enumerate(all_mitigatable, 1):
            plan_item = {
                'priority': i,
                'exposure_id': exposure.vector_id,
                'exposure_type': exposure.exposure_type.value,
                'risk_level': exposure.risk_level.value,
                'mitigation_status': exposure.mitigation_status.value,
                'steps': exposure.mitigation_steps,
                'notes': exposure.notes
            }
            mitigation_plan.append(plan_item)

        return mitigation_plan

    def export_assessment(self, filename: str = "opsec_exposure_assessment.json"):
        """Export complete OPSEC assessment"""

        export_data = {
            'generated': datetime.now().isoformat(),
            'framework': 'OPSEC Exposure Assessment Tool',
            'total_operators': len(self.operators),
            'total_incidents': len(self.incidents),
            'operators': [],
            'incidents': []
        }

        # Export operator assessments
        for operator in self.operators:
            operator_data = operator.to_dict()
            operator_data['assessment'] = self.assess_operator(operator)
            operator_data['mitigation_plan'] = self.generate_mitigation_plan(operator)
            export_data['operators'].append(operator_data)

        # Export incidents
        for incident in self.incidents:
            incident_data = incident.to_dict()
            incident_data['analysis'] = self.analyze_incident(incident)
            export_data['incidents'].append(incident_data)

        with open(filename, 'w') as f:
            json.dump(export_data, f, indent=2)

        print(f"[+] Exported OPSEC assessment to {filename}")
        return filename


def main():
    """Demo: OPSEC exposure assessment"""
    print("=" * 80)
    print("OPSEC EXPOSURE ASSESSMENT TOOL")
    print("=" * 80)
    print()
    print("Evaluating operational security risks for intelligence operators")
    print("Based on Jake Williams Shadow Brokers exposure (2017)")
    print()

    # Initialize framework
    framework = OPSECAssessmentFramework()

    # Get Jake Williams profile
    jake = framework.operators[0]

    print(f"[+] Operator: {jake.name}")
    print(f"    Operator ID: {jake.operator_id}")
    print(f"    Current Role: {jake.current_role}")
    print(f"    Intelligence Background: {jake.years_in_intelligence} years")
    print()

    # Overall assessment
    print("=" * 80)
    print("EXPOSURE ASSESSMENT")
    print("=" * 80)
    print()

    assessment = framework.assess_operator(jake)
    print(f"Exposure Score: {assessment['exposure_score']}/100")
    print(f"Total Exposures: {assessment['total_exposures']}")
    print(f"Permanent Exposures: {assessment['permanent_exposures']}")
    print(f"Mitigatable Exposures: {assessment['mitigatable_exposures']}")
    print()

    print("Exposure Breakdown:")
    for exp_type, count in assessment['exposure_breakdown'].items():
        print(f"  {exp_type}: {count}")
    print()

    print("Risk Breakdown:")
    for risk, count in assessment['risk_breakdown'].items():
        print(f"  {risk.upper()}: {count}")
    print()

    print(f"Recommendation: {assessment['recommendation']}")
    print()

    # Detailed exposures
    print("=" * 80)
    print("EXPOSURE VECTORS")
    print("=" * 80)
    print()

    for exposure in jake.exposures:
        print(f"[{exposure.vector_id}] {exposure.exposure_type.value.upper()}")
        print(f"  Risk: {exposure.risk_level.value.upper()}")
        print(f"  Status: {exposure.mitigation_status.value}")
        print(f"  Description: {exposure.description}")
        if exposure.mitigation_steps:
            print(f"  Mitigation:")
            for step in exposure.mitigation_steps:
                print(f"    - {step}")
        print(f"  Notes: {exposure.notes}")
        print()

    # Travel restrictions
    print("=" * 80)
    print("TRAVEL RESTRICTIONS")
    print("=" * 80)
    print()

    print(f"High-Risk Countries ({len(jake.high_risk_countries)}):")
    for country in jake.high_risk_countries:
        print(f"  - {country}")
    print()

    print(f"Travel Restrictions ({len(jake.travel_restrictions)}):")
    for restriction in jake.travel_restrictions:
        print(f"  - {restriction}")
    print()

    # Incident analysis
    print("=" * 80)
    print("OPSEC INCIDENTS")
    print("=" * 80)
    print()

    for incident in framework.incidents:
        incident_analysis = framework.analyze_incident(incident)
        print(f"[{incident.incident_id}] {incident.incident_type}")
        print(f"  Date: {incident.incident_date}")
        print(f"  Impact: {incident.impact.value.upper()}")
        print(f"  Source: {incident.attribution_source}")
        print(f"  Description: {incident.description}")
        print()
        print(f"  Exposures Revealed ({len(incident.exposures_revealed)}):")
        for exposure in incident.exposures_revealed:
            print(f"    - {exposure}")
        print()
        print(f"  Immediate Actions ({len(incident.immediate_actions)}):")
        for action in incident.immediate_actions:
            print(f"    - {action}")
        print()
        print(f"  Long-term Consequences ({len(incident.long_term_consequences)}):")
        for consequence in incident.long_term_consequences:
            print(f"    - {consequence}")
        print()

    # Mitigation plan
    print("=" * 80)
    print("MITIGATION PLAN")
    print("=" * 80)
    print()

    mitigation_plan = framework.generate_mitigation_plan(jake)
    print(f"Total Mitigatable Exposures: {len(mitigation_plan)}")
    print()

    for item in mitigation_plan:
        print(f"Priority {item['priority']}: [{item['exposure_id']}] {item['exposure_type']}")
        print(f"  Risk: {item['risk_level'].upper()}")
        print(f"  Steps:")
        for step in item['steps']:
            print(f"    - {step}")
        print()

    # Export
    print("=" * 80)
    print("EXPORTING ASSESSMENT")
    print("=" * 80)
    print()

    framework.export_assessment("opsec_exposure_assessment.json")

    print()
    print("=" * 80)
    print("ASSESSMENT COMPLETE")
    print("=" * 80)
    print()
    print("Key Takeaways:")
    print("  - Public attribution by adversaries creates permanent OPSEC damage")
    print("  - Travel to adversary nations becomes high-risk post-exposure")
    print("  - Social media and professional visibility increase attribution surface")
    print("  - Historical operational data cannot be retroactively secured")
    print("  - Ongoing OPSEC discipline critical even post-retirement")
    print()


if __name__ == "__main__":
    main()
