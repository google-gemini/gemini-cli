/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { ToolResult } from './tools.js';
import { BasePythonTool } from './base-python-tool.js';

interface JPXInvestorParams {
  /** Operation to perform */
  op: 'get_latest' | 'get_historical' | 'download_all' | 'get_cached';
  /** Number of days to look back (for get_latest and get_cached) */
  days_back?: number;
  /** Start date for historical data (YYYY-MM-DD) */
  start_date?: string;
  /** End date for historical data (YYYY-MM-DD) */
  end_date?: string;
  /** Number of years to download (for download_all) */
  years_back?: number;
}

interface JPXInvestorResult extends ToolResult {
  data?: Array<{
    date: string;
    filename: string;
    week_info: {
      year: number | null;
      week_number: number | null;
      period: string | null;
    };
    data: {
      foreign_net_flow: number;
      individual_net_flow: number;
      trust_bank_net_flow: number;
      investment_trust_net_flow: number;
      foreign_buy: number;
      foreign_sell: number;
      individual_cash_buy: number;
      individual_cash_sell: number;
      individual_credit_buy: number;
      individual_credit_sell: number;
      trust_bank_buy: number;
      trust_bank_sell: number;
      investment_trust_buy: number;
      investment_trust_sell: number;
    };
  }>;
  download_count?: number;
}

export class JPXInvestorTool extends BasePythonTool<JPXInvestorParams, JPXInvestorResult> {
  static readonly Name: string = 'jpx_investor_tool';
  constructor(config: Config) {
    super(
      'jpx_investor_tool',
      'JPX Investor Data Tool',
      'Access JPX (Japan Exchange Group) investor flow data including foreign investors, individual investors, trust banks, and investment trusts',
      [
        'requests',
        'beautifulsoup4',
        'pandas',
        'openpyxl',
        'lxml',
        'xlrd'
      ],
      {
        type: 'object',
        properties: {
          op: {
            type: 'string',
            enum: ['get_latest', 'get_historical', 'download_all', 'get_cached'],
            description: 'Operation to perform: get_latest (recent data), get_historical (date range), download_all (download files), get_cached (local data only)'
          },
          days_back: {
            type: 'number',
            minimum: 1,
            maximum: 365,
            description: 'Number of days to look back (default: 30)',
            default: 30
          },
          start_date: {
            type: 'string',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
            description: 'Start date for historical data (YYYY-MM-DD format)'
          },
          end_date: {
            type: 'string',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
            description: 'End date for historical data (YYYY-MM-DD format)'
          },
          years_back: {
            type: 'number',
            minimum: 1,
            maximum: 5,
            description: 'Number of years to download (default: 2)',
            default: 2
          }
        },
        required: ['op'],
        additionalProperties: false
      },
      config,
      true,
      false
    );
  }

  protected override requiresConfirmation(_params: JPXInvestorParams): boolean {
    // JPX investor tool only reads investor data, no confirmation needed
    return false;
  }

  protected generatePythonCode(params: JPXInvestorParams): string {
    return `
import json
import os
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urljoin

import pandas as pd
import requests
from bs4 import BeautifulSoup

class JPXInvestorDataCollector:
    """
    JPX (Japan Exchange Group) Investor Data Collector

    Downloads and parses JPX investor type statistics Excel files
    Extracts key data from TSE Prime worksheet about investor flows
    """

    def __init__(self, data_dir=None):
        if data_dir is None:
            # Use unified temporary data directory
            import tempfile
            temp_dir = Path(tempfile.gettempdir())
            data_dir = temp_dir / "gemini_cli_data" / "jpx_investor"

        self.data_dir = Path(data_dir)
        self.excel_dir = self.data_dir / "excel_files"
        self.processed_dir = self.data_dir / "processed"

        # Create directories
        self.excel_dir.mkdir(parents=True, exist_ok=True)
        self.processed_dir.mkdir(parents=True, exist_ok=True)

        self.base_url = "https://www.jpx.co.jp"
        # Archive URL template: 2025=00, 2024=01, 2023=02
        self.archive_url_template = "https://www.jpx.co.jp/markets/statistics-equities/investor-type/00-00-archives-{:02d}.html"

        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        }

    def get_excel_file_urls(self, years_back=2):
        """Get Excel file URLs from JPX website"""
        all_excel_files = []
        current_year = datetime.now().year

        try:
            for year_offset in range(years_back):
                target_year = current_year - year_offset
                archive_url = self.archive_url_template.format(year_offset)

                print(f"Getting JPX archive page {target_year}: {archive_url}")

                try:
                    response = requests.get(archive_url, headers=self.headers, timeout=30)
                    response.raise_for_status()

                    soup = BeautifulSoup(response.content, 'html.parser')
                    links = soup.find_all('a', href=True)
                    year_excel_files = []

                    for link in links:
                        href = link['href']

                        if 'stock_val' in href and href.endswith('.xls'):
                            if href.startswith('http'):
                                full_url = href
                            else:
                                full_url = urljoin(self.base_url, href)

                            filename = os.path.basename(href)

                            # Extract date from filename
                            date_match = re.search(r'stock_val_\\d+_(\\d{6})\\.xls', filename)
                            if date_match:
                                date_str = date_match.group(1)
                                try:
                                    year_2digit = int(date_str[:2])
                                    if year_2digit >= 23:
                                        year = 2000 + year_2digit
                                    else:
                                        year = 2000 + year_2digit

                                    month = int(date_str[2:4])
                                    day = int(date_str[4:6])
                                    file_date = f"{year:04d}-{month:02d}-{day:02d}"

                                    year_excel_files.append({
                                        'url': full_url,
                                        'filename': filename,
                                        'date': file_date,
                                        'year': year
                                    })

                                except ValueError as e:
                                    print(f"Cannot parse date from filename {filename}: {e}")
                                    continue

                    print(f"Found {len(year_excel_files)} Excel files for {target_year}")
                    all_excel_files.extend(year_excel_files)

                    time.sleep(0.5)  # Rate limiting

                except requests.RequestException as e:
                    print(f"Failed to get {target_year} archive page: {e}")
                    continue

            # Sort by date
            all_excel_files.sort(key=lambda x: x['date'], reverse=True)
            print(f"Total found {len(all_excel_files)} Excel files covering last {years_back} years")

            return all_excel_files

        except Exception as e:
            print(f"Failed to get Excel file URLs: {e}")
            return []

    def download_excel_file(self, url, filename):
        """Download Excel file to local directory"""
        local_path = self.excel_dir / filename

        if local_path.exists():
            print(f"File exists, skipping download: {filename}")
            return str(local_path)

        try:
            print(f"Downloading: {filename}")
            response = requests.get(url, headers=self.headers, timeout=60)
            response.raise_for_status()

            with open(local_path, 'wb') as f:
                f.write(response.content)

            print(f"Download complete: {filename} ({len(response.content)} bytes)")
            return str(local_path)

        except Exception as e:
            print(f"Download failed {filename}: {e}")
            return None

    def parse_excel_file(self, file_path):
        """Parse Excel file and extract investor data"""
        try:
            print(f"Parsing Excel file: {os.path.basename(file_path)}")

            # Try to read Tokyo & Nagoya worksheet
            try:
                df = pd.read_excel(file_path, sheet_name='Tokyo & Nagoya', header=None)
            except Exception as e:
                print(f"Cannot read Tokyo & Nagoya worksheet, trying other names: {e}")
                xl_file = pd.ExcelFile(file_path)
                sheet_names = xl_file.sheet_names
                print(f"Available worksheets: {sheet_names}")

                target_sheet = None
                for sheet in sheet_names:
                    if 'prime' in sheet.lower() or 'tse' in sheet.lower():
                        target_sheet = sheet
                        break

                if target_sheet:
                    df = pd.read_excel(file_path, sheet_name=target_sheet, header=None)
                else:
                    print(f"No suitable worksheet found, using first: {sheet_names[0]}")
                    df = pd.read_excel(file_path, sheet_name=sheet_names[0], header=None)

            filename = os.path.basename(file_path)

            # Extract time info from A4 cell
            week_info = None
            year_info = None
            week_period = None
            file_date = None

            try:
                if len(df) >= 4 and len(df.columns) >= 1:
                    a4_content = str(df.iloc[3, 0])  # A4 cell
                    print(f"A4 cell content: {a4_content}")

                    year_match = re.search(r'(\\d{4})年', a4_content)
                    week_match = re.search(r'第(\\d+)週', a4_content)
                    period_match = re.search(r'\\(\\s*(\\d+/\\d+)\\s*-\\s*(\\d+/\\d+)\\s*\\)', a4_content)

                    if year_match and week_match:
                        year_info = int(year_match.group(1))
                        week_info = int(week_match.group(1))

                    if period_match:
                        start_date = period_match.group(1)
                        end_date = period_match.group(2)
                        week_period = f"{start_date} - {end_date}"

                        try:
                            end_month, end_day = map(int, end_date.split('/'))
                            file_date = f"{year_info:04d}-{end_month:02d}-{end_day:02d}"
                        except:
                            file_date = None

            except Exception as e:
                print(f"Cannot parse time info from A4 cell: {e}")

            # Fallback to filename parsing
            if not file_date:
                date_match = re.search(r'stock_val_\\d+_(\\d{6})\\.xls', filename)
                if date_match:
                    date_str = date_match.group(1)
                    year = 2000 + int(date_str[:2])
                    month = int(date_str[2:4])
                    day = int(date_str[4:6])
                    file_date = f"{year:04d}-{month:02d}-{day:02d}"
                else:
                    file_date = datetime.now().strftime('%Y-%m-%d')

            # Define data extraction points
            data_points = {
                # Foreign Investors
                'foreign_sell': ('I', 30),
                'foreign_buy': ('I', 31),
                # Individual Investors
                'individual_cash_sell': ('C', 68),
                'individual_cash_buy': ('E', 68),
                'individual_credit_buy': ('C', 69),
                'individual_credit_sell': ('E', 69),
                # Trust Banks
                'trust_bank_sell': ('I', 58),
                'trust_bank_buy': ('I', 59),
                # Investment Trusts
                'investment_trust_sell': ('I', 38),
                'investment_trust_buy': ('I', 39),
            }

            # Extract data
            extracted_data = {
                'date': file_date,
                'filename': filename,
                'week_info': {
                    'year': year_info,
                    'week_number': week_info,
                    'period': week_period
                },
                'data': {}
            }

            for field_name, (col_letter, row_num) in data_points.items():
                try:
                    col_index = ord(col_letter.upper()) - ord('A')
                    row_index = row_num - 1

                    if row_index < len(df) and col_index < len(df.columns):
                        value = df.iloc[row_index, col_index]

                        if pd.isna(value):
                            processed_value = 0
                        elif isinstance(value, (int, float)):
                            processed_value = float(value)
                        elif isinstance(value, str):
                            cleaned_value = re.sub(r'[^\\d.-]', '', str(value))
                            try:
                                processed_value = float(cleaned_value) if cleaned_value else 0
                            except ValueError:
                                processed_value = 0
                        else:
                            processed_value = 0

                        extracted_data['data'][field_name] = processed_value
                    else:
                        print(f"Position out of range: {col_letter}{row_num}")
                        extracted_data['data'][field_name] = 0

                except Exception as e:
                    print(f"Failed to extract data {field_name}: {e}")
                    extracted_data['data'][field_name] = 0

            # Calculate derived metrics
            data = extracted_data['data']

            # Net flows (positive = net buying, negative = net selling)
            data['foreign_net_flow'] = data['foreign_buy'] - data['foreign_sell']

            individual_total_buy = data['individual_cash_buy'] + data['individual_credit_buy']
            individual_total_sell = data['individual_cash_sell'] + data['individual_credit_sell']
            data['individual_net_flow'] = individual_total_buy - individual_total_sell

            data['trust_bank_net_flow'] = data['trust_bank_buy'] - data['trust_bank_sell']
            data['investment_trust_net_flow'] = data['investment_trust_buy'] - data['investment_trust_sell']

            print(f"Successfully parsed data, foreign net flow: {data['foreign_net_flow']:,.0f}")
            return extracted_data

        except Exception as e:
            print(f"Failed to parse Excel file {file_path}: {e}")
            return None

    def save_processed_data(self, data, file_date):
        """Save processed data to JSON file"""
        try:
            output_file = self.processed_dir / f"investor_data_{file_date}.json"

            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            print(f"Data saved to: {output_file}")

        except Exception as e:
            print(f"Failed to save data: {e}")

    def download_all_available_files(self, years_back=3):
        """Download all available Excel files"""
        try:
            print(f"Starting download of JPX investor data files for last {years_back} years")

            excel_files = self.get_excel_file_urls(years_back)

            if not excel_files:
                print("No Excel files found")
                return 0

            downloaded_count = 0

            for file_info in excel_files:
                local_file = self.download_excel_file(file_info['url'], file_info['filename'])

                if local_file:
                    parsed_data = self.parse_excel_file(local_file)

                    if parsed_data:
                        self.save_processed_data(parsed_data, parsed_data['date'])
                        downloaded_count += 1

                        time.sleep(1)  # Rate limiting

            print(f"Download complete, processed {downloaded_count} files")
            return downloaded_count

        except Exception as e:
            print(f"Download failed: {e}")
            return 0

    def get_cached_data(self, days_back=30, start_date=None, end_date=None):
        """Get data from local cache with time filtering"""
        try:
            cached_data = []

            if start_date or end_date:
                if start_date:
                    start_dt = datetime.strptime(start_date, '%Y-%m-%d')
                else:
                    start_dt = datetime.min

                if end_date:
                    end_dt = datetime.strptime(end_date, '%Y-%m-%d')
                else:
                    end_dt = datetime.max
            else:
                end_dt = datetime.now()
                start_dt = end_dt - timedelta(days=days_back)

            for json_file in self.processed_dir.glob("investor_data_*.json"):
                try:
                    with open(json_file, encoding='utf-8') as f:
                        data = json.load(f)

                    file_date = datetime.strptime(data['date'], '%Y-%m-%d')

                    if start_dt <= file_date <= end_dt:
                        cached_data.append(data)

                except Exception as e:
                    print(f"Failed to read cache file {json_file}: {e}")
                    continue

            cached_data.sort(key=lambda x: x['date'], reverse=True)
            print(f"Loaded {len(cached_data)} records from cache")
            return cached_data

        except Exception as e:
            print(f"Failed to get cached data: {e}")
            return []

    def check_remote_files(self, years_back=3):
        """Check what files are available remotely and compare with local files"""
        try:
            print(f"Checking remote files for last {years_back} years...")
            remote_files = self.get_excel_file_urls(years_back)

            if not remote_files:
                print("No remote files found")
                return []

            new_files = []
            for file_info in remote_files:
                filename = file_info['filename']
                local_path = self.excel_dir / filename

                if not local_path.exists():
                    new_files.append(file_info)
                    print(f"New file found: {filename}")
                else:
                    # Check file size or modification time if needed
                    # For now, we assume existing files are up to date
                    print(f"File already exists: {filename}")

            print(f"Found {len(new_files)} new files to download")
            return new_files

        except Exception as e:
            print(f"Failed to check remote files: {e}")
            return []

    def download_new_files(self, years_back=3):
        """Download only new files that don't exist locally and parse them"""
        try:
            new_files = self.check_remote_files(years_back)

            if not new_files:
                print("No new files to download")
                return 0

            download_count = 0
            for file_info in new_files:
                try:
                    filename = file_info['filename']
                    url = file_info['url']

                    print(f"Downloading: {filename}")

                    response = requests.get(url, headers=self.headers, timeout=60)
                    response.raise_for_status()

                    local_path = self.excel_dir / filename
                    with open(local_path, 'wb') as f:
                        f.write(response.content)

                    print(f"Downloaded: {filename} ({len(response.content)} bytes)")

                    # Parse the downloaded file
                    parsed_data = self.parse_excel_file(str(local_path))
                    if parsed_data:
                        self.save_processed_data(parsed_data, parsed_data['date'])
                        download_count += 1

                    time.sleep(1)  # Rate limiting

                except Exception as e:
                    print(f"Failed to download {filename}: {e}")
                    continue

            print(f"Successfully downloaded and processed {download_count} new files")
            return download_count

        except Exception as e:
            print(f"Failed to download new files: {e}")
            return 0

    def get_latest_data_smart(self, days_back=30, years_back=3):
        """Get latest investor data with smart file checking"""
        try:
            # First check if we have sufficient local data
            cached_data = self.get_cached_data(days_back)

            if len(cached_data) < 3:
                print("Insufficient local data, checking for new files...")
                download_count = self.download_new_files(years_back)
                if download_count > 0:
                    print(f"Downloaded {download_count} new files, refreshing cache...")
                    cached_data = self.get_cached_data(days_back)
            else:
                # Check for new files in the background but don't wait
                print("Checking for new files in background...")
                new_file_count = len(self.check_remote_files(years_back))
                if new_file_count > 0:
                    print(f"Found {new_file_count} new files available for download")
                    download_count = self.download_new_files(years_back)
                    if download_count > 0:
                        print(f"Downloaded {download_count} new files, refreshing cache...")
                        cached_data = self.get_cached_data(days_back)

            print(f"Successfully retrieved {len(cached_data)} investor data records")
            return cached_data

        except Exception as e:
            print(f"Failed to get latest data: {e}")
            return []

# Main execution
try:
    collector = JPXInvestorDataCollector()

    op = "${params.op}"

    if op == "download_all":
        years_back = ${params.years_back || 2}
        count = collector.download_all_available_files(years_back)
        result = {"download_count": count, "success": True}

    elif op == "get_latest":
        days_back = ${params.days_back || 30}
        years_back = ${params.years_back || 2}
        data = collector.get_latest_data_smart(days_back, years_back)
        result = {"data": data, "success": True}

    elif op == "get_cached":
        days_back = ${params.days_back || 30}
        start_date = ${params.start_date ? `"${params.start_date}"` : 'None'}
        end_date = ${params.end_date ? `"${params.end_date}"` : 'None'}
        data = collector.get_cached_data(days_back, start_date, end_date)
        result = {"data": data, "success": True}

    elif op == "get_historical":
        start_date = ${params.start_date ? `"${params.start_date}"` : 'None'}
        end_date = ${params.end_date ? `"${params.end_date}"` : 'None'}
        if start_date or end_date:
            data = collector.get_cached_data(start_date=start_date, end_date=end_date)
            result = {"data": data, "success": True}
        else:
            result = {"error": "start_date or end_date required for historical data", "success": False}
    else:
        result = {"error": f"Unknown operation: {op}", "success": False}

    print("\\n" + "="*50)
    print("JPX_INVESTOR_RESULT_START")
    print(json.dumps(result, ensure_ascii=False))
    print("JPX_INVESTOR_RESULT_END")
    print("="*50)

except Exception as e:
    error_result = {"error": str(e), "success": False}
    print("\\n" + "="*50)
    print("JPX_INVESTOR_RESULT_START")
    print(json.dumps(error_result, ensure_ascii=False))
    print("JPX_INVESTOR_RESULT_END")
    print("="*50)
`;
  }

  protected parseResult(pythonOutput: string, _params: JPXInvestorParams): JPXInvestorResult {
    try {
      // Extract result from Python output
      const startMarker = 'JPX_INVESTOR_RESULT_START';
      const endMarker = 'JPX_INVESTOR_RESULT_END';

      const startIndex = pythonOutput.indexOf(startMarker);
      const endIndex = pythonOutput.indexOf(endMarker);

      if (startIndex === -1 || endIndex === -1) {
        return {
          llmContent: 'JPX Investor Tool: Failed to parse result from Python output',
          returnDisplay: 'Failed to parse result from Python output'
        };
      }

      const resultJson = pythonOutput.substring(
        startIndex + startMarker.length,
        endIndex
      ).trim();

      const result = JSON.parse(resultJson);

      if (!result.success) {
        return {
          llmContent: `JPX Investor Tool Error: ${result.error}`,
          returnDisplay: `Error: ${result.error}`
        };
      }

      // Format success result
      let content = 'JPX Investor Data Retrieved Successfully\n\n';
      let display = 'JPX Investor Data Retrieved\n\n';

      if (result.download_count !== undefined) {
        content += `Downloaded and processed: ${result.download_count} files\n`;
        display += `Downloaded: ${result.download_count} files\n`;
      }

      if (result.data && Array.isArray(result.data)) {
        const data = result.data;
        content += `Records retrieved: ${data.length}\n\n`;
        display += `Records: ${data.length}\n\n`;

        if (data.length > 0) {
          content += 'Recent Data Summary:\n';
          display += 'Recent Data:\n';

          // Show top 5 records
          const topRecords = data.slice(0, 5);

          for (const record of topRecords) {
            const date = record.date;
            const weekInfo = record.week_info;
            const investorData = record.data;

            content += `\nDate: ${date}\n`;
            display += `${date}: `;

            if (weekInfo?.year && weekInfo?.week_number) {
              content += `Week: ${weekInfo.year} Year Week ${weekInfo.week_number}`;
              if (weekInfo.period) {
                content += ` (${weekInfo.period})`;
              }
              content += '\n';
            }

            content += `Foreign Net Flow: ¥${investorData.foreign_net_flow.toLocaleString()}\n`;
            content += `Individual Net Flow: ¥${investorData.individual_net_flow.toLocaleString()}\n`;
            content += `Trust Bank Net Flow: ¥${investorData.trust_bank_net_flow.toLocaleString()}\n`;
            content += `Investment Trust Net Flow: ¥${investorData.investment_trust_net_flow.toLocaleString()}\n`;

            display += `Foreign ¥${(investorData.foreign_net_flow / 1000000).toFixed(1)}M, `;
            display += `Individual ¥${(investorData.individual_net_flow / 1000000).toFixed(1)}M\n`;
          }

          if (data.length > 5) {
            content += `\n... and ${data.length - 5} more records\n`;
            display += `... ${data.length - 5} more records\n`;
          }
        }
      }

      return {
        llmContent: content,
        returnDisplay: display,
        data: result.data,
        download_count: result.download_count
      };

    } catch (error) {
      return {
        llmContent: `JPX Investor Tool: Failed to parse result - ${error}`,
        returnDisplay: `Failed to parse result: ${error}`
      };
    }
  }
}