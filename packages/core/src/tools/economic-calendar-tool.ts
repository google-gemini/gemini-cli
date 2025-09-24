/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { ToolResult } from './tools.js';
import { BasePythonTool } from './base-python-tool.js';

interface EconomicCalendarParams {
  op: 'get_events' | 'upcoming' | 'high_impact';
  hours_ahead?: number;
  countries?: string[];
}

interface EconomicCalendarResult extends ToolResult {
  data?: {
    events: Array<{
      title: string;
      country: string;
      publish_date: string;
      impact: string;
      previous: string;
      consensus: string;
      actual: string;
      link: string;
    }>;
    summary: string;
    country_filter?: string[];
  };
}

export class EconomicCalendarTool extends BasePythonTool<EconomicCalendarParams, EconomicCalendarResult> {
  static readonly Name: string = 'economic_calendar_tool';
  constructor(config: Config) {
    super(
      'economic_calendar_tool',
      'Economic Calendar',
      'Get economic events and calendar data from MyFXBook RSS feed',
      ['feedparser', 'beautifulsoup4'],
      {
        type: 'object',
        properties: {
          op: {
            type: 'string',
            enum: ['get_events', 'upcoming', 'high_impact'],
            description: 'Operation to perform: get_events (all events), upcoming (upcoming events), high_impact (high impact events)',
          },
          hours_ahead: {
            type: 'number',
            description: 'Hours ahead to look for upcoming/high_impact events (default: 24 for upcoming, 48 for high_impact)',
            minimum: 1,
            maximum: 168,
          },
          countries: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: 'Filter events by specific countries (e.g., ["usa", "japan", "germany"]). If not specified, returns events from all countries.',
          },
        },
        required: ['op'],
      },
      config,
      true,
      false,
    );
  }

  protected generatePythonCode(params: EconomicCalendarParams): string {
    const { op, hours_ahead, countries } = params;

    const defaultHours = op === 'high_impact' ? 48 : 24;
    const hoursValue = hours_ahead || defaultHours;
    const countryFilter = countries ? JSON.stringify(countries.map(c => c.toLowerCase())) : '[]';

    return `
import feedparser
from datetime import datetime, timezone, timedelta
from typing import List, Dict
from dataclasses import dataclass, asdict
from bs4 import BeautifulSoup
import json

@dataclass
class EconomicEventItem:
    """Economic event data model"""
    title: str
    link: str
    publish_date: str
    impact: str
    previous: str
    consensus: str
    actual: str
    country: str
    description: str = ""

class MyFXBookEconomicCalendar:
    """MyFXBook economic calendar reader"""

    def __init__(self):
        self.rss_url = "https://www.myfxbook.com/rss/forex-economic-calendar-events"

    def _extract_country_from_link(self, link: str) -> str:
        """
        Extract country name from MyFXBook link
        Example: https://www.myfxbook.com/forex-economic-calendar/spain/balance-of-trade -> spain
        """
        try:
            if not link or not isinstance(link, str):
                return "unknown"

            # Remove protocol and domain part
            if "myfxbook.com/forex-economic-calendar/" in link:
                # Split link to get country part
                parts = link.split("/forex-economic-calendar/")
                if len(parts) > 1:
                    # Get country part (e.g. "spain/balance-of-trade" -> "spain")
                    country_part = parts[1].split("/")[0]
                    if country_part and country_part.strip():
                        return country_part.strip().lower()

            return "unknown"

        except Exception as e:
            print(f"Failed to extract country info: {e}, link: {link}")
            return "unknown"

    def _get_impact_level(self, html_content: str) -> str:
        """
        Parse impact level
        Based on CSS class names in HTML content to determine impact level
        """
        if not html_content:
            return "None"

        html_lower = html_content.lower()

        if "sprite-no-impact" in html_lower:
            return "None"
        elif "sprite-low-impact" in html_lower:
            return "Low"
        elif "sprite-medium-impact" in html_lower:
            return "Medium"
        elif "sprite-high-impact" in html_lower:
            return "High"
        else:
            return "Unknown"

    def _parse_event_data(self, description: str) -> Dict[str, str]:
        """
        Parse event data
        Extract detailed economic data from RSS description HTML
        """
        try:
            soup = BeautifulSoup(description, 'html.parser')

            # Find second row of data (index 1, since first row is usually header)
            rows = soup.find_all('tr')
            if len(rows) < 2:
                return {
                    'impact': 'None',
                    'previous': 'No data',
                    'consensus': 'No data',
                    'actual': 'No data'
                }

            data_row = rows[1]  # Second row contains actual data
            cells = data_row.find_all('td')

            if len(cells) < 5:
                return {
                    'impact': 'None',
                    'previous': 'No data',
                    'consensus': 'No data',
                    'actual': 'No data'
                }

            # Extract cell data
            impact_html = cells[1].decode_contents().strip() if len(cells) > 1 else ""
            impact = self._get_impact_level(impact_html)
            previous = cells[2].get_text(strip=True) if len(cells) > 2 else "No data"
            consensus = cells[3].get_text(strip=True) if len(cells) > 3 else "No data"
            actual = cells[4].get_text(strip=True) if len(cells) > 4 else "No data"

            return {
                'impact': impact,
                'previous': previous,
                'consensus': consensus,
                'actual': actual
            }

        except Exception as e:
            print(f"Failed to parse event data: {e}")
            return {
                'impact': 'None',
                'previous': 'Parse failed',
                'consensus': 'Parse failed',
                'actual': 'Parse failed'
            }

    def get_economic_events(self) -> List[EconomicEventItem]:
        """
        Get economic events list
        """
        events = []

        try:
            print(f"Starting to fetch MyFXBook economic calendar data: {self.rss_url}")

            # Parse RSS using feedparser
            feed = feedparser.parse(self.rss_url)

            if not feed.entries:
                print("No entries found in RSS Feed")
                return events

            print(f"Successfully parsed RSS Feed, found {len(feed.entries)} events")

            for entry in feed.entries:
                try:
                    # Basic information
                    title = entry.title if hasattr(entry, 'title') else "No title"
                    link = entry.link if hasattr(entry, 'link') else "No link"
                    description = entry.summary if hasattr(entry, 'summary') else ""

                    # Handle publish time
                    if hasattr(entry, 'published_parsed') and entry.published_parsed:
                        publish_date = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
                        # Convert to local time
                        publish_date = publish_date.astimezone()
                    else:
                        publish_date = datetime.now()
                        print(f"Event '{title}' has no valid publish time, using current time")

                    # Parse detailed data
                    event_data = self._parse_event_data(description)

                    # Extract country info from link
                    country = self._extract_country_from_link(link)

                    event = EconomicEventItem(
                        title=title,
                        link=link,
                        publish_date=publish_date,
                        impact=event_data['impact'],
                        previous=event_data['previous'],
                        consensus=event_data['consensus'],
                        actual=event_data['actual'],
                        country=country,
                        description=description
                    )

                    events.append(event)

                except Exception as e:
                    print(f"Failed to parse single event: {e}")
                    continue

            print(f"Successfully retrieved {len(events)} economic events")
            return events

        except Exception as e:
            print(f"Failed to get economic events: {e}")
            return events

    def get_upcoming_events(self, hours_ahead: int = 24) -> List[EconomicEventItem]:
        """
        Get upcoming economic events within specified hours
        """
        all_events = self.get_economic_events()

        if not all_events:
            return []

        # Make sure now has timezone info
        now = datetime.now(timezone.utc).astimezone()
        future_time = now + timedelta(hours=hours_ahead)

        upcoming_events = []
        for event in all_events:
            try:
                # event.publish_date is already a datetime object
                if now <= event.publish_date <= future_time:
                    upcoming_events.append(event)
            except Exception as e:
                print(f"Failed to parse event time: {e}")
                continue

        # Sort by time
        upcoming_events.sort(key=lambda x: x.publish_date)

        print(f"Found {len(upcoming_events)} events in the next {hours_ahead} hours")
        return upcoming_events

    def get_high_impact_events(self, hours_ahead: int = 48) -> List[EconomicEventItem]:
        """
        Get high impact economic events
        """
        upcoming_events = self.get_upcoming_events(hours_ahead)

        high_impact_events = [
            event for event in upcoming_events
            if event.impact in ["High", "Medium"]
        ]

        print(f"Found {len(high_impact_events)} high/medium impact events")
        return high_impact_events

    def filter_by_countries(self, events: List[EconomicEventItem], countries: List[str]) -> List[EconomicEventItem]:
        """
        Filter events by specified countries
        """
        if not countries:
            return events

        # Country name mapping from user input to actual MyFXBook country names
        country_mapping = {
            'usa': 'united-states',
            'us': 'united-states',
            'united states': 'united-states',
            'america': 'united-states',
            'uk': 'united-kingdom',
            'britain': 'united-kingdom',
            'great britain': 'united-kingdom',
            'england': 'united-kingdom',
            'euro zone': 'euro-area',
            'eurozone': 'euro-area',
            'euro area': 'euro-area',
            'eu': 'european-union',
            'europe': 'european-union',
            'japan': 'japan',  # Japan might not be in current feed but keep mapping
            'china': 'china',
            'korea': 'south-korea',
            'south korea': 'south-korea',
            'germany': 'germany',
            'france': 'france',
            'canada': 'canada',
            'australia': 'australia',
            'hong kong': 'hong-kong',
            'india': 'india',
            'taiwan': 'taiwan',
        }

        # Build actual filter list with mapped country names
        actual_filter = []
        for country in countries:
            country_lower = country.lower().strip()
            # Check if there's a mapping
            if country_lower in country_mapping:
                actual_filter.append(country_mapping[country_lower])
            else:
                # Use as-is if no mapping found
                actual_filter.append(country_lower)

        # Convert to lowercase for case-insensitive matching
        actual_filter_lower = [c.lower() for c in actual_filter]

        filtered_events = []
        for event in events:
            if event.country and event.country.lower() in actual_filter_lower:
                filtered_events.append(event)

        print(f"Filtered {len(events)} events to {len(filtered_events)} events")
        print(f"Original filter: {countries}")
        print(f"Mapped filter: {actual_filter}")
        return filtered_events

# Execute operation
calendar = MyFXBookEconomicCalendar()
country_filter = ${countryFilter}

if "${op}" == "get_events":
    events = calendar.get_economic_events()
    if country_filter:
        events = calendar.filter_by_countries(events, country_filter)
    summary = f"Retrieved {len(events)} economic events"
    if country_filter:
        summary += f" (filtered by countries: {', '.join(country_filter)})"
elif "${op}" == "upcoming":
    events = calendar.get_upcoming_events(${hoursValue})
    if country_filter:
        events = calendar.filter_by_countries(events, country_filter)
    summary = f"Found {len(events)} economic events in the next {${hoursValue}} hours"
    if country_filter:
        summary += f" (filtered by countries: {', '.join(country_filter)})"
elif "${op}" == "high_impact":
    events = calendar.get_high_impact_events(${hoursValue})
    if country_filter:
        events = calendar.filter_by_countries(events, country_filter)
    summary = f"Found {len(events)} high/medium impact economic events in the next {${hoursValue}} hours"
    if country_filter:
        summary += f" (filtered by countries: {', '.join(country_filter)})"
else:
    events = []
    summary = "Unknown operation"

# Convert datetime objects to ISO strings for JSON serialization
def serialize_event(event):
    import re
    event_dict = asdict(event)
    if hasattr(event.publish_date, 'isoformat'):
        event_dict['publish_date'] = event.publish_date.isoformat()

    # Clean description field to avoid JSON parsing issues
    if 'description' in event_dict and event_dict['description']:
        # Remove HTML tags and normalize whitespace
        description = event_dict['description']
        description = re.sub(r'<[^>]+>', '', description)  # Remove HTML tags
        description = re.sub(r'\\s+', ' ', description)     # Normalize whitespace
        description = description.strip()                  # Remove leading/trailing spaces
        event_dict['description'] = description

    return event_dict

# Output result
result = {
    "events": [serialize_event(event) for event in events],
    "summary": summary,
    "country_filter": country_filter
}

print(json.dumps(result, ensure_ascii=False, indent=2))
`;
  }

  protected parseResult(pythonOutput: string, params: EconomicCalendarParams): EconomicCalendarResult {
    try {
      if (!pythonOutput.trim()) {
        return {
          llmContent: 'No result',
          returnDisplay: '❌ No result',
        };
      }

      // Try to extract JSON from the output
      const lines = pythonOutput.trim().split('\n');
      let jsonOutput = '';
      let inJsonBlock = false;

      for (const line of lines) {
        if (line.trim().startsWith('{')) {
          inJsonBlock = true;
        }
        if (inJsonBlock) {
          jsonOutput += line + '\n';
        }
        if (line.trim().endsWith('}') && inJsonBlock) {
          break;
        }
      }

      if (!jsonOutput.trim()) {
        // If no JSON found, look for the last JSON-like content
        const jsonMatch = pythonOutput.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonOutput = jsonMatch[0];
        }
      }

      if (!jsonOutput.trim()) {
        return {
          llmContent: `Raw output:\n${pythonOutput}`,
          returnDisplay: '⚠️ Unable to parse JSON result',
        };
      }

      const data = JSON.parse(jsonOutput.trim());

      if (!data.events || !Array.isArray(data.events)) {
        return {
          llmContent: `Parse result format error:\n${pythonOutput}`,
          returnDisplay: '❌ Parse result format error',
        };
      }

      const { events, summary, country_filter } = data;
      let displayContent = `## ${summary}\n\n`;

      if (country_filter && country_filter.length > 0) {
        displayContent += `**Country Filter**: ${country_filter.join(', ')}\n\n`;
      }

      if (events.length === 0) {
        displayContent += 'No economic events found matching the criteria.\n';
      } else {
        displayContent += '| Time | Country | Event | Impact | Previous | Consensus | Actual |\n';
        displayContent += '|------|---------|-------|--------|----------|-----------|--------|\n';

        for (const event of events) {
          const date = new Date(event.publish_date).toLocaleString('en-US');
          const country = event.country || 'Unknown';
          const title = event.title || 'No title';
          const impact = event.impact || 'None';
          const previous = event.previous || '-';
          const consensus = event.consensus || '-';
          const actual = event.actual || '-';

          displayContent += `| ${date} | ${country} | ${title} | ${impact} | ${previous} | ${consensus} | ${actual} |\n`;
        }

        if (params.op === 'high_impact') {
          displayContent += '\n### 📈 High Impact Event Analysis\n';
          const highImpactEvents = events.filter((e: { impact: string }) => e.impact === 'High');
          const mediumImpactEvents = events.filter((e: { impact: string }) => e.impact === 'Medium');

          displayContent += `- **High Impact Events**: ${highImpactEvents.length}\n`;
          displayContent += `- **Medium Impact Events**: ${mediumImpactEvents.length}\n`;

          if (highImpactEvents.length > 0) {
            displayContent += '\n**High Impact Events to Watch**:\n';
            for (const event of highImpactEvents) {
              const date = new Date(event.publish_date).toLocaleString('en-US');
              displayContent += `- ${date} | ${event.country}: ${event.title}\n`;
            }
          }
        }

        displayContent += `\n*Data source: MyFXBook Economic Calendar*\n`;
      }

      return {
        llmContent: displayContent,
        returnDisplay: displayContent,
        data: { events, summary, country_filter },
      };

    } catch (error) {
      return {
        llmContent: `Failed to parse result: ${error}\n\nRaw output:\n${pythonOutput}`,
        returnDisplay: `❌ Failed to parse result: ${error}`,
      };
    }
  }
}