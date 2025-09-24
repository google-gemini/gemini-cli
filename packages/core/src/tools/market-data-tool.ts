/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { ToolResult } from './tools.js';
import { BasePythonTool } from './base-python-tool.js';

export interface MarketDataTool3Params {
  op: 'get_quote' | 'get_historical' | 'search_symbols' | 'get_indices' | 'screen_stocks' | 'get_technical_indicators' | 'get_n225' | 'get_sp500' | 'get_nasdaq' | 'get_usdjpy';
  symbols?: string[];
  data_source?: 'auto' | 'tvscreener' | 'yfinance';
  markets?: string[];
  interval?: '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w' | '1M';
  period?: string;
  timeframe?: number;
  search_query?: string;
  include_indicators?: boolean;
  indicator_types?: string[];
  // Enhanced parameters for tvscreener
  screener_filters?: Record<string, unknown>;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  limit?: number;
  // Index-specific parameters
  index_types?: Array<'SP500' | 'NASDAQ' | 'NIKKEI225' | 'DJI' | 'FTSE' | 'DAX'>;
}

interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  market_cap?: number;
  open?: number;
  high?: number;
  low?: number;
  timestamp: string;
  source: string;
  market?: string;
  sector?: string;
  pe_ratio?: number;
  technical_rating?: string;
  indicators?: Record<string, number>;
}

interface HistoricalBar {
  symbol: string;
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: string;
  indicators?: Record<string, number>;
}

interface ScreenerResult {
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  market_cap: number;
  pe_ratio?: number;
  eps_ttm?: number;
  sector: string;
  market: string;
  technical_rating?: string;
  relative_volume?: number;
  volatility?: number;
}

interface IndexData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  timestamp: string;
  source: string;
  constituents_count?: number;
  indicators?: Record<string, number>;
}

interface TechnicalIndicator {
  symbol: string;
  indicator_name: string;
  value: number;
  signal?: 'BUY' | 'SELL' | 'NEUTRAL';
  timeframe: string;
  calculation_time: string;
}

interface MarketDataTool3Result extends ToolResult {
  data?: {
    quotes?: QuoteData[];
    bars?: HistoricalBar[];
    screener_results?: ScreenerResult[];
    indices?: IndexData[];
    technical_indicators?: TechnicalIndicator[];
    summary: string;
    metadata?: Record<string, unknown>;
  };
}

export class MarketDataTool extends BasePythonTool<MarketDataTool3Params, MarketDataTool3Result> {
  static readonly Name: string = 'market_data_tool';
  constructor(config: Config) {
    super(
      'market_data_tool',
      'Advanced Market Data API (tvscreener)',
      'Professional-grade market data using tvscreener for comprehensive market screening and analysis with support for SP500, NASDAQ, NIKKEI225, individual stocks, and advanced technical indicators. Provides real-time quotes, market screening, and technical analysis.',
      ['tvscreener', 'pandas', 'numpy', 'yfinance', 'ta', 'selenium'],
      {
        type: 'object',
        properties: {
          op: {
            type: 'string',
            enum: ['get_quote', 'get_historical', 'search_symbols', 'get_indices', 'screen_stocks', 'get_technical_indicators', 'get_n225', 'get_sp500', 'get_nasdaq', 'get_usdjpy'],
            description: 'Operation: get_quote (real-time quotes), get_historical (OHLC data), search_symbols (find symbols), get_indices (major indices), screen_stocks (stock screening), get_technical_indicators (technical analysis), get_n225 (Nikkei 225), get_sp500 (S&P 500), get_nasdaq (NASDAQ), get_usdjpy (USD/JPY)',
          },
          symbols: {
            type: 'array',
            items: { type: 'string' },
            description: 'Stock symbols to query (e.g., ["AAPL", "GOOGL", "TSLA", "NASDAQ:MSFT"])',
          },
          data_source: {
            type: 'string',
            enum: ['auto', 'tvscreener', 'yfinance'],
            description: 'Preferred data source: auto (try both), tvscreener (TradingView data), yfinance (Yahoo Finance). Default: auto',
          },
          markets: {
            type: 'array',
            items: { type: 'string' },
            description: 'Market filters: america, japan, europe, korea, china, india, crypto, forex',
          },
          interval: {
            type: 'string',
            enum: ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'],
            description: 'Time interval for data (default: 1d)',
          },
          period: {
            type: 'string',
            description: 'Period for historical data (1d, 7d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, max)',
          },
          timeframe: {
            type: 'number',
            description: 'Timeframe in days for analysis (default: 30)',
          },
          search_query: {
            type: 'string',
            description: 'Search query for symbol/company search',
          },
          include_indicators: {
            type: 'boolean',
            description: 'Include technical indicators in results (default: false)',
          },
          indicator_types: {
            type: 'array',
            items: { type: 'string' },
            description: 'Technical indicators: SMA, EMA, RSI, MACD, Bollinger, Stochastic, ADX, ATR, VWAP, OBV, Williams_R',
          },
          screener_filters: {
            type: 'object',
            description: 'Advanced screener filters (market_cap_min, pe_ratio_max, volume_min, sector, etc.)',
          },
          sort_by: {
            type: 'string',
            description: 'Field to sort by (Price, Change %, Volume, Market Cap, PE Ratio, etc.)',
          },
          sort_order: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort order (default: desc)',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return (default: 50)',
          },
          index_types: {
            type: 'array',
            items: { type: 'string', enum: ['SP500', 'NASDAQ', 'NIKKEI225', 'DJI', 'FTSE', 'DAX'] },
            description: 'Specific indices to retrieve',
          },
        },
        required: ['op'],
      },
      config,
      true,
      false,
    );
  }

  protected generatePythonCode(params: MarketDataTool3Params): string {
    const {
      op,
      symbols,
      data_source,
      markets,
      interval,
      period,
      timeframe,
      search_query,
      include_indicators,
      indicator_types,
      screener_filters,
      sort_by,
      sort_order,
      limit,
      index_types,
    } = params;

    const symbolsStr = symbols ? JSON.stringify(symbols) : '[]';
    const dataSourceValue = data_source || 'auto';
    const marketsStr = markets ? JSON.stringify(markets) : '[]';
    const intervalValue = interval || '1d';
    const periodValue = period || '1mo';
    const timeframeValue = timeframe || 30;
    const searchQueryValue = search_query || '';
    const includeIndicators = include_indicators ? 'True' : 'False';
    const indicatorTypesStr = indicator_types ? JSON.stringify(indicator_types) : '[]';
    const screenerFiltersStr = screener_filters ? JSON.stringify(screener_filters) : '{}';
    const sortByValue = sort_by || 'Market Capitalization';
    const sortOrderValue = sort_order === 'asc' ? 'True' : 'False';
    const limitValue = limit || 50;
    const indexTypesStr = index_types ? JSON.stringify(index_types) : '[]';

    return `
import json
import pandas as pd
import numpy as np
import time
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import warnings
warnings.filterwarnings('ignore')

# Import libraries with error handling
try:
    import tvscreener as tvs
    TVSCREENER_AVAILABLE = True
except ImportError as e:
    TVSCREENER_AVAILABLE = False
    tvscreener_error = str(e)

try:
    import yfinance as yf
    YFINANCE_AVAILABLE = True
except ImportError:
    YFINANCE_AVAILABLE = False

try:
    import ta
    TA_AVAILABLE = True
except ImportError:
    TA_AVAILABLE = False

# TradingView scraper functionality
try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.chrome.options import Options
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False

class TechnicalIndicators:
    """Advanced technical indicator calculations"""

    @staticmethod
    def calculate_all_indicators(df: pd.DataFrame, indicator_types: List[str]) -> Dict[str, float]:
        """Calculate all requested technical indicators"""
        indicators = {}

        if len(df) < 2:
            return indicators

        try:
            close = df['Close'] if 'Close' in df.columns else df['close']
            high = df['High'] if 'High' in df.columns else df['high']
            low = df['Low'] if 'Low' in df.columns else df['low']
            volume = df['Volume'] if 'Volume' in df.columns else df['volume']

            for indicator in indicator_types:
                try:
                    if indicator == 'SMA' and len(close) >= 20:
                        indicators['SMA_20'] = float(close.rolling(20).mean().iloc[-1])
                        if len(close) >= 50:
                            indicators['SMA_50'] = float(close.rolling(50).mean().iloc[-1])

                    elif indicator == 'EMA' and len(close) >= 20:
                        indicators['EMA_20'] = float(close.ewm(span=20).mean().iloc[-1])
                        if len(close) >= 50:
                            indicators['EMA_50'] = float(close.ewm(span=50).mean().iloc[-1])

                    elif indicator == 'RSI' and len(close) >= 14:
                        delta = close.diff()
                        gain = (delta.where(delta > 0, 0)).rolling(14).mean()
                        loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
                        rs = gain / loss
                        indicators['RSI'] = float(100 - (100 / (1 + rs)).iloc[-1])

                    elif indicator == 'MACD' and len(close) >= 26:
                        ema_12 = close.ewm(span=12).mean()
                        ema_26 = close.ewm(span=26).mean()
                        macd = ema_12 - ema_26
                        signal = macd.ewm(span=9).mean()
                        indicators['MACD'] = float(macd.iloc[-1])
                        indicators['MACD_Signal'] = float(signal.iloc[-1])
                        indicators['MACD_Histogram'] = float((macd - signal).iloc[-1])

                    elif indicator == 'Bollinger' and len(close) >= 20:
                        bb_sma = close.rolling(20).mean()
                        bb_std = close.rolling(20).std()
                        indicators['BB_Upper'] = float((bb_sma + 2 * bb_std).iloc[-1])
                        indicators['BB_Middle'] = float(bb_sma.iloc[-1])
                        indicators['BB_Lower'] = float((bb_sma - 2 * bb_std).iloc[-1])

                    elif indicator == 'Stochastic' and len(close) >= 14:
                        low_14 = low.rolling(14).min()
                        high_14 = high.rolling(14).max()
                        k_percent = 100 * ((close - low_14) / (high_14 - low_14))
                        indicators['Stoch_K'] = float(k_percent.iloc[-1])
                        indicators['Stoch_D'] = float(k_percent.rolling(3).mean().iloc[-1])

                    elif indicator == 'ATR' and len(close) >= 14:
                        tr1 = high - low
                        tr2 = abs(high - close.shift())
                        tr3 = abs(low - close.shift())
                        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
                        indicators['ATR'] = float(tr.rolling(14).mean().iloc[-1])

                    elif indicator == 'VWAP' and len(close) >= 1:
                        vwap = (close * volume).cumsum() / volume.cumsum()
                        indicators['VWAP'] = float(vwap.iloc[-1])

                    elif indicator == 'OBV' and len(close) >= 1:
                        obv = ((close > close.shift()) * volume).cumsum()
                        indicators['OBV'] = float(obv.iloc[-1])

                except Exception as e:
                    print(f"Error calculating {indicator}: {e}")
                    continue

        except Exception as e:
            print(f"Error in indicator calculation: {e}")

        return indicators

    @staticmethod
    def get_signal(indicator_name: str, value: float, current_price: float = None) -> str:
        """Generate trading signal based on indicator value"""
        if 'RSI' in indicator_name:
            if value > 70:
                return 'SELL'
            elif value < 30:
                return 'BUY'
            else:
                return 'NEUTRAL'
        elif 'MACD_Histogram' in indicator_name:
            return 'BUY' if value > 0 else 'SELL'
        elif 'Stoch_K' in indicator_name:
            if value > 80:
                return 'SELL'
            elif value < 20:
                return 'BUY'
            else:
                return 'NEUTRAL'
        else:
            return 'NEUTRAL'

class MarketDataAPI:
    """Market Data API using tvscreener and yfinance"""

    def __init__(self):
        self.ti = TechnicalIndicators()
        # Common forex pairs
        self.forex_pairs = [
            'USDJPY', 'EURUSD', 'GBPUSD', 'AUDUSD', 'USDCAD', 'USDCHF',
            'NZDUSD', 'EURJPY', 'GBPJPY', 'EURGBP', 'AUDJPY', 'EURAUD'
        ]
        self.market_map = {
            'america': tvs.Market.AMERICA if TVSCREENER_AVAILABLE else None,
            'japan': tvs.Market.JAPAN if TVSCREENER_AVAILABLE else None,
            'uk': tvs.Market.UK if TVSCREENER_AVAILABLE else None,
            'germany': tvs.Market.GERMANY if TVSCREENER_AVAILABLE else None,
            'france': tvs.Market.FRANCE if TVSCREENER_AVAILABLE else None,
            'korea': tvs.Market.KOREA if TVSCREENER_AVAILABLE else None,
            'china': tvs.Market.CHINA if TVSCREENER_AVAILABLE else None,
            'india': tvs.Market.INDIA if TVSCREENER_AVAILABLE else None,
        }
        self.index_symbols = {
            'SP500': {'tvs': 'SP:SPX', 'yf': '^GSPC', 'name': 'S&P 500 Index'},
            'NASDAQ': {'tvs': 'NASDAQ:IXIC', 'yf': '^IXIC', 'name': 'NASDAQ Composite'},
            'NIKKEI225': {'tvs': 'TVC:NI225', 'yf': '^N225', 'name': 'Nikkei 225'},
            'DJI': {'tvs': 'DJ:DJI', 'yf': '^DJI', 'name': 'Dow Jones Industrial Average'},
            'FTSE': {'tvs': 'TVC:UKX', 'yf': '^FTSE', 'name': 'FTSE 100'},
            'DAX': {'tvs': 'XETR:DAX', 'yf': '^GDAXI', 'name': 'DAX 40'}
        }

        # TradingView URLs for futures data
        self.tradingview_futures_urls = {
            'N225': 'https://cn.tradingview.com/symbols/FOREXCOM-JP225/',
            'SP500': 'https://cn.tradingview.com/symbols/SPX/?exchange=SP',
            'NASDAQ': 'https://cn.tradingview.com/symbols/IG-NASDAQ/',
            'USDJPY': 'https://cn.tradingview.com/symbols/USDJPY/?exchange=FX'
        }

    def get_quotes_from_screener(self, symbols: List[str], include_indicators: bool = False, indicator_types: List[str] = None) -> List[Dict[str, Any]]:
        """Get quotes using tvscreener"""
        if not TVSCREENER_AVAILABLE:
            return [{'error': f'tvscreener not available: {tvscreener_error}', 'symbols': symbols}]

        quotes = []

        try:
            # Get stock data
            ss = tvs.StockScreener()
            df_stocks = ss.get()

            # Get crypto data if needed
            cs = tvs.CryptoScreener()
            df_crypto = cs.get()

            # Get forex data if needed
            fs = tvs.ForexScreener()
            df_forex = fs.get()

            # Combine all dataframes
            all_dfs = []
            if not df_stocks.empty:
                df_stocks['market'] = 'stocks'
                all_dfs.append(df_stocks)
            if not df_crypto.empty:
                df_crypto['market'] = 'crypto'
                all_dfs.append(df_crypto)
            if not df_forex.empty:
                df_forex['market'] = 'forex'
                all_dfs.append(df_forex)

            if all_dfs:
                df_all = pd.concat(all_dfs, ignore_index=True)

                for symbol in symbols:
                    # Try different symbol formats
                    symbol_variants = [symbol, f"NASDAQ:{symbol}", f"NYSE:{symbol}"]

                    for variant in symbol_variants:
                        matches = df_all[df_all['Symbol'].str.contains(variant, case=False, na=False)]

                        if not matches.empty:
                            row = matches.iloc[0]
                            quote = {
                                'symbol': symbol,
                                'price': float(row.get('Price', 0)),
                                'change': float(row.get('Change', 0)),
                                'change_percent': float(str(row.get('Change %', '0')).replace('%', '').replace('+', '') or 0),
                                'volume': int(row.get('Volume', 0)),
                                'market_cap': float(row.get('Market Capitalization', 0)),
                                'open': float(row.get('Open', 0)) if 'Open' in row else None,
                                'high': float(row.get('High', 0)) if 'High' in row else None,
                                'low': float(row.get('Low', 0)) if 'Low' in row else None,
                                'pe_ratio': float(row.get('Price to Earnings Ratio (TTM)', 0)) if 'Price to Earnings Ratio (TTM)' in row else None,
                                'sector': str(row.get('Sector', '')),
                                'market': row.get('market', 'unknown'),
                                'technical_rating': str(row.get('Technical Rating', '')),
                                'timestamp': datetime.now().isoformat(),
                                'source': 'tvscreener'
                            }

                            # Add indicators if requested
                            if include_indicators and indicator_types and YFINANCE_AVAILABLE:
                                yf_symbol = variant.split(':')[-1]
                                indicators = self._get_indicators_yfinance(yf_symbol, indicator_types)
                                quote['indicators'] = indicators

                            quotes.append(quote)
                            break

                    # If not found in screener, fallback to yfinance
                    if not any(q['symbol'] == symbol for q in quotes):
                        if YFINANCE_AVAILABLE:
                            yf_quote = self._get_quote_yfinance(symbol, include_indicators, indicator_types)
                            if yf_quote:
                                quotes.append(yf_quote)

                        # If still not found after fallback, provide search suggestions
                        if not any(q['symbol'] == symbol for q in quotes):
                            print(f"Symbol '{symbol}' not found in any data source, searching for similar symbols...")
                            search_results = self.search_symbols(symbol, limit=5)
                            suggestions = []
                            for result in search_results[:5]:
                                if not result.get('error'):
                                    suggestions.append(f"{result.get('symbol', 'N/A')} - {result.get('name', 'N/A')}")

                            error_msg = f"Symbol '{symbol}' not found in any data source."
                            if suggestions:
                                error_msg += f" Did you mean: {', '.join(suggestions)}"

                            quotes.append({
                                'symbol': symbol,
                                'error': error_msg,
                                'suggestions': suggestions,
                                'price': 0,
                                'change': 0,
                                'change_percent': 0,
                                'volume': 0,
                                'timestamp': datetime.now().isoformat(),
                                'source': 'error'
                            })

        except Exception as e:
            print(f"Error in get_quotes_from_screener: {e}")

        return quotes

    def get_quotes_with_source(self, symbols: List[str], data_source: str = 'auto', include_indicators: bool = False, indicator_types: List[str] = None) -> List[Dict[str, Any]]:
        """Get quotes with specified data source preference"""
        if data_source == 'tvscreener':
            return self.get_quotes_from_screener(symbols, include_indicators, indicator_types)
        elif data_source == 'yfinance':
            quotes = []
            for symbol in symbols:
                quote = self._get_quote_yfinance(symbol, include_indicators, indicator_types)
                if quote:
                    quotes.append(quote)
                else:
                    quotes.append({
                        'symbol': symbol,
                        'error': f'Symbol {symbol} not found in yfinance',
                        'price': 0,
                        'change': 0,
                        'change_percent': 0,
                        'volume': 0,
                        'timestamp': datetime.now().isoformat(),
                        'source': 'error'
                    })
            return quotes
        else:  # auto mode - try both sources
            return self.get_quotes_from_screener(symbols, include_indicators, indicator_types)

    def _get_quote_yfinance(self, symbol: str, include_indicators: bool = False, indicator_types: List[str] = None) -> Optional[Dict[str, Any]]:
        """Get quote using yfinance as fallback"""
        if not YFINANCE_AVAILABLE:
            return None

        try:
            # Handle forex pairs - add =X suffix if needed
            original_symbol = symbol
            if self._is_forex_pair(symbol) and not symbol.endswith('=X'):
                symbol = f"{symbol}=X"
                print(f"Detected forex pair, trying: {symbol}")

            ticker = yf.Ticker(symbol)
            info = ticker.info
            hist = ticker.history(period="2d")

            # Check if data is empty - symbol might not exist
            if len(hist) == 0:
                # Search for similar symbols
                print(f"No data found for '{symbol}', searching for similar symbols...")
                search_results = self.search_symbols(symbol, limit=5)
                suggestions = []
                for result in search_results[:5]:
                    if not result.get('error'):
                        suggestions.append(f"{result.get('symbol', 'N/A')} - {result.get('name', 'N/A')}")

                error_msg = f"Symbol '{symbol}' not found or has no data."
                if suggestions:
                    error_msg += f" Did you mean: {', '.join(suggestions)}"

                return {
                    'symbol': original_symbol,
                    'error': error_msg,
                    'suggestions': suggestions,
                    'timestamp': datetime.now().isoformat(),
                    'source': 'symbol_not_found'
                }

            if len(hist) >= 1:
                current_price = hist['Close'].iloc[-1]
                if len(hist) >= 2:
                    prev_price = hist['Close'].iloc[-2]
                    change = current_price - prev_price
                    change_percent = (change / prev_price) * 100
                else:
                    change = 0
                    change_percent = 0

                quote = {
                    'symbol': original_symbol,
                    'price': float(current_price),
                    'change': float(change),
                    'change_percent': float(change_percent),
                    'volume': int(hist['Volume'].iloc[-1]),
                    'market_cap': info.get('marketCap', 0),
                    'open': float(hist['Open'].iloc[-1]),
                    'high': float(hist['High'].iloc[-1]),
                    'low': float(hist['Low'].iloc[-1]),
                    'pe_ratio': info.get('trailingPE'),
                    'sector': info.get('sector', ''),
                    'timestamp': datetime.now().isoformat(),
                    'source': 'yfinance'
                }

                if include_indicators and indicator_types:
                    indicators = self._get_indicators_yfinance(symbol, indicator_types)
                    quote['indicators'] = indicators

                return quote

        except Exception as e:
            print(f"Yahoo Finance error for {symbol}: {e}")
            # Also try to search for similar symbols on generic errors
            search_results = self.search_symbols(symbol, limit=3)
            suggestions = []
            for result in search_results[:3]:
                if not result.get('error'):
                    suggestions.append(f"{result.get('symbol', 'N/A')} - {result.get('name', 'N/A')}")

            error_msg = f"Error: {str(e)}"
            if suggestions:
                error_msg += f" Suggestions: {', '.join(suggestions)}"

            return {
                'symbol': original_symbol,
                'error': error_msg,
                'suggestions': suggestions,
                'timestamp': datetime.now().isoformat(),
                'source': 'error'
            }

    def _get_indicators_yfinance(self, symbol: str, indicator_types: List[str]) -> Dict[str, float]:
        """Calculate indicators using yfinance data"""
        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(period="6mo")

            if len(df) > 0:
                return self.ti.calculate_all_indicators(df, indicator_types)
        except Exception as e:
            print(f"Error getting indicators for {symbol}: {e}")

        return {}

    def get_historical_data(self, symbols: List[str], interval: str, period: str, include_indicators: bool = False, indicator_types: List[str] = None) -> List[Dict[str, Any]]:
        """Get historical OHLC data using yfinance"""
        if not YFINANCE_AVAILABLE:
            return [{'error': 'yfinance not available'}]

        bars = []

        for symbol in symbols:
            try:
                # Handle forex pairs - add =X suffix if needed
                original_symbol = symbol
                if self._is_forex_pair(symbol) and not symbol.endswith('=X'):
                    symbol = f"{symbol}=X"
                    print(f"Detected forex pair, using: {symbol}")

                ticker = yf.Ticker(symbol)
                df = ticker.history(period=period, interval=interval)

                # Check if data is empty - symbol might not exist
                if df.empty:
                    # Search for similar symbols
                    print(f"No data found for '{symbol}', searching for similar symbols...")
                    search_results = self.search_symbols(symbol, limit=5)
                    suggestions = []
                    for result in search_results[:5]:
                        if not result.get('error'):
                            suggestions.append(f"{result.get('symbol', 'N/A')} - {result.get('name', 'N/A')}")

                    error_msg = f"Symbol '{symbol}' not found or has no data."
                    if suggestions:
                        error_msg += f" Did you mean: {', '.join(suggestions)}"

                    bars.append({
                        'symbol': original_symbol,
                        'error': error_msg,
                        'suggestions': suggestions,
                        'datetime': datetime.now().isoformat(),
                        'open': 0, 'high': 0, 'low': 0, 'close': 0, 'volume': 0,
                        'source': 'symbol_not_found'
                    })
                    continue

                for timestamp, row in df.iterrows():
                    bar = {
                        'symbol': original_symbol,
                        'datetime': timestamp.isoformat(),
                        'open': float(row['Open']),
                        'high': float(row['High']),
                        'low': float(row['Low']),
                        'close': float(row['Close']),
                        'volume': int(row['Volume']),
                        'source': 'yfinance'
                    }
                    bars.append(bar)

                # Add indicators to the latest bar if requested
                if include_indicators and indicator_types and bars and len(df) > 0:
                    indicators = self.ti.calculate_all_indicators(df, indicator_types)
                    if indicators and bars:
                        bars[-1]['indicators'] = indicators

            except Exception as e:
                print(f"Error getting historical data for {symbol}: {e}")
                # Also try to search for similar symbols on generic errors
                search_results = self.search_symbols(symbol, limit=3)
                suggestions = []
                for result in search_results[:3]:
                    if not result.get('error'):
                        suggestions.append(f"{result.get('symbol', 'N/A')} - {result.get('name', 'N/A')}")

                error_msg = f"Error: {str(e)}"
                if suggestions:
                    error_msg += f" Suggestions: {', '.join(suggestions)}"

                bars.append({
                    'symbol': original_symbol,
                    'error': error_msg,
                    'suggestions': suggestions,
                    'datetime': datetime.now().isoformat(),
                    'open': 0, 'high': 0, 'low': 0, 'close': 0, 'volume': 0,
                    'source': 'error'
                })

        return bars

    def get_historical_data_with_source(self, symbols: List[str], data_source: str = 'auto', interval: str = '1d', period: str = '1mo', include_indicators: bool = False, indicator_types: List[str] = None) -> List[Dict[str, Any]]:
        """Get historical data with specified data source preference"""
        if data_source == 'yfinance' or data_source == 'auto':
            # For historical data, currently only yfinance is supported
            return self.get_historical_data(symbols, interval, period, include_indicators, indicator_types)
        elif data_source == 'tvscreener':
            # TVScreener doesn't provide historical data, fallback to yfinance
            bars = []
            for symbol in symbols:
                bars.append({
                    'symbol': symbol,
                    'error': 'TVScreener does not provide historical data. Use yfinance or auto mode.',
                    'datetime': datetime.now().isoformat(),
                    'open': 0, 'high': 0, 'low': 0, 'close': 0, 'volume': 0,
                    'source': 'error'
                })
            return bars
        else:
            return self.get_historical_data(symbols, interval, period, include_indicators, indicator_types)

    def screen_stocks(self, markets: List[str], filters: Dict[str, Any], sort_by: str, ascending: bool, limit: int) -> List[Dict[str, Any]]:
        """Screen stocks using tvscreener"""
        if not TVSCREENER_AVAILABLE:
            return [{'error': f'tvscreener not available: {tvscreener_error}'}]

        results = []

        try:
            # Determine which screener to use
            if not markets or 'crypto' in markets:
                screener = tvs.CryptoScreener()
                market_type = 'crypto'
            elif 'forex' in markets:
                screener = tvs.ForexScreener()
                market_type = 'forex'
            else:
                screener = tvs.StockScreener()
                market_type = 'stocks'

                # Set markets if specified
                if markets:
                    market_objs = []
                    for market in markets:
                        if market.lower() in self.market_map and self.market_map[market.lower()]:
                            market_objs.append(self.market_map[market.lower()])
                    if market_objs:
                        screener.set_markets(*market_objs)

            # Get data
            df = screener.get()

            if not df.empty:
                # Apply filters
                if filters:
                    for field, value in filters.items():
                        if field == 'market_cap_min' and 'Market Capitalization' in df.columns:
                            df = df[df['Market Capitalization'] >= value]
                        elif field == 'pe_ratio_max' and 'Price to Earnings Ratio (TTM)' in df.columns:
                            df = df[df['Price to Earnings Ratio (TTM)'] <= value]
                        elif field == 'volume_min' and 'Volume' in df.columns:
                            df = df[df['Volume'] >= value]
                        elif field == 'sector' and 'Sector' in df.columns:
                            df = df[df['Sector'].str.contains(value, case=False, na=False)]

                # Sort
                if sort_by in df.columns:
                    df = df.sort_values(sort_by, ascending=ascending)

                # Limit results
                df = df.head(limit)

                # Convert to our format
                for _, row in df.iterrows():
                    result = {
                        'symbol': str(row.get('Symbol', '')),
                        'name': str(row.get('Description', row.get('Name', ''))),
                        'price': float(row.get('Price', 0)),
                        'change': float(row.get('Change', 0)),
                        'change_percent': float(str(row.get('Change %', '0')).replace('%', '').replace('+', '') or 0),
                        'volume': int(row.get('Volume', 0)),
                        'market_cap': float(row.get('Market Capitalization', 0)),
                        'pe_ratio': float(row.get('Price to Earnings Ratio (TTM)', 0)) if 'Price to Earnings Ratio (TTM)' in row else None,
                        'eps_ttm': float(row.get('Basic EPS (TTM)', 0)) if 'Basic EPS (TTM)' in row else None,
                        'sector': str(row.get('Sector', '')),
                        'market': market_type,
                        'technical_rating': str(row.get('Technical Rating', '')),
                        'relative_volume': float(row.get('Relative Volume', 0)) if 'Relative Volume' in row else None,
                        'volatility': float(row.get('Volatility', 0)) if 'Volatility' in row else None,
                    }
                    results.append(result)

        except Exception as e:
            results.append({'error': f'Screening error: {str(e)}'})

        return results

    def get_indices_data(self, index_types: List[str], include_indicators: bool = False, indicator_types: List[str] = None) -> List[Dict[str, Any]]:
        """Get major indices data"""
        indices = []

        for index_type in index_types:
            if index_type not in self.index_symbols:
                indices.append({
                    'symbol': index_type,
                    'error': f'Unknown index type: {index_type}',
                    'name': index_type
                })
                continue

            index_info = self.index_symbols[index_type]

            # Try tvscreener first
            if TVSCREENER_AVAILABLE:
                try:
                    ss = tvs.StockScreener()
                    df = ss.get()

                    if not df.empty:
                        matches = df[df['Symbol'] == index_info['tvs']]
                        if not matches.empty:
                            row = matches.iloc[0]
                            index_data = {
                                'symbol': index_type,
                                'name': index_info['name'],
                                'price': float(row.get('Price', 0)),
                                'change': float(row.get('Change', 0)),
                                'change_percent': float(str(row.get('Change %', '0')).replace('%', '').replace('+', '') or 0),
                                'open': float(row.get('Open', 0)) if 'Open' in row else 0,
                                'high': float(row.get('High', 0)) if 'High' in row else 0,
                                'low': float(row.get('Low', 0)) if 'Low' in row else 0,
                                'volume': int(row.get('Volume', 0)),
                                'timestamp': datetime.now().isoformat(),
                                'source': 'tvscreener',
                                'constituents_count': self._get_constituents_count(index_type)
                            }

                            if include_indicators and indicator_types and YFINANCE_AVAILABLE:
                                indicators = self._get_indicators_yfinance(index_info['yf'], indicator_types)
                                index_data['indicators'] = indicators

                            indices.append(index_data)
                            continue
                except Exception as e:
                    print(f"tvscreener failed for {index_type}: {e}")

            # Fallback to yfinance
            if YFINANCE_AVAILABLE:
                try:
                    yf_quote = self._get_quote_yfinance(index_info['yf'], include_indicators, indicator_types)
                    if yf_quote:
                        yf_quote['symbol'] = index_type
                        yf_quote['name'] = index_info['name']
                        yf_quote['constituents_count'] = self._get_constituents_count(index_type)
                        indices.append(yf_quote)
                    else:
                        raise Exception("Failed to get yfinance data")
                except Exception as e:
                    indices.append({
                        'symbol': index_type,
                        'error': f'Failed to get data: {str(e)}',
                        'name': index_info['name'],
                        'price': 0,
                        'change': 0,
                        'change_percent': 0,
                        'timestamp': datetime.now().isoformat(),
                        'source': 'error'
                    })
            else:
                indices.append({
                    'symbol': index_type,
                    'error': 'No data source available',
                    'name': index_info['name'],
                    'price': 0,
                    'change': 0,
                    'change_percent': 0,
                    'timestamp': datetime.now().isoformat(),
                    'source': 'error'
                })

        return indices

    def _is_forex_pair(self, symbol: str) -> bool:
        """Check if symbol is a forex pair"""
        # Check common forex pairs
        symbol_upper = symbol.upper().replace('=X', '')
        if symbol_upper in self.forex_pairs:
            return True

        # Check if it matches forex pattern (6 letters, common currencies)
        currencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD']
        if len(symbol_upper) == 6:
            first_currency = symbol_upper[:3]
            second_currency = symbol_upper[3:6]
            if first_currency in currencies and second_currency in currencies:
                return True

        return False

    def _get_constituents_count(self, index_type: str) -> int:
        """Get number of constituents for index"""
        counts = {
            'SP500': 500,
            'NASDAQ': 3000,
            'NIKKEI225': 225,
            'DJI': 30,
            'FTSE': 100,
            'DAX': 40
        }
        return counts.get(index_type, 0)

    def scrape_tradingview_data(self, symbol_key: str) -> Dict[str, Any]:
        """Scrape real-time futures data from TradingView"""
        # If Selenium not available, return empty data structure
        # This allows operations to continue with API data only
        if not SELENIUM_AVAILABLE:
            return {
                'symbol': symbol_key,
                'source': 'tradingview_futures',
                'status': 'selenium_not_available',
                'timestamp': datetime.now().isoformat(),
                'note': 'Install selenium for TradingView data'
            }

        if symbol_key not in self.tradingview_futures_urls:
            return {'error': f'No TradingView URL configured for {symbol_key}'}

        url = self.tradingview_futures_urls[symbol_key]

        try:
            # Configure Chrome options
            chrome_options = Options()
            chrome_options.add_argument('--headless')
            chrome_options.add_argument('--no-sandbox')
            chrome_options.add_argument('--disable-dev-shm-usage')
            chrome_options.add_argument('--disable-gpu')
            chrome_options.add_argument('--window-size=1920,1080')
            chrome_options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')

            # Precise CSS selectors
            selectors = {
                'current_price': '#js-category-content > div.js-symbol-page-header-root > div > div.symbolRow-NopKb87z > div > div.quotesRow-iJMmXWiA > div:nth-child(1) > div > div.lastContainer-zoF9r75I > span.last-zoF9r75I.js-symbol-last',
                'volume': '#symbol-overview-page-section > div > div > div:nth-child(2) > div.content-oFtCtY_t > div > div:nth-child(1) > div.wrapper-QCJM7wcY > div.blockContent-QCJM7wcY > div',
                'previous_close': '#symbol-overview-page-section > div > div > div:nth-child(2) > div.content-oFtCtY_t > div > div:nth-child(2) > div.wrapper-QCJM7wcY > div.blockContent-QCJM7wcY > div',
                'open_price': '#symbol-overview-page-section > div > div > div:nth-child(2) > div.content-oFtCtY_t > div > div:nth-child(3) > div.wrapper-QCJM7wcY > div.blockContent-QCJM7wcY > div'
            }

            # Fallback selectors (from tradingview-scraper.ts)
            fallback_selectors = {
                'current_price': ['.js-symbol-last', 'span.js-symbol-last', '[class*="js-symbol-last"]'],
                'volume': ['[class*="volume"]', '[title*="Volume"]'],
                'previous_close': ['[class*="prev"]', '[title*="Previous"]'],
                'open_price': ['[class*="open"]', '[title*="Open"]']
            }

            def clean_financial_data(text, field_type):
                """Clean and convert financial data"""
                if not text:
                    return None

                clean_text = text.strip().replace(',', '').replace(' ', '')

                if field_type == 'volume':
                    # Handle volume with K, M, B suffixes
                    clean_text = clean_text.upper()
                    multipliers = {'K': 1000, 'M': 1000000, 'B': 1000000000}

                    for suffix, multiplier in multipliers.items():
                        if clean_text.endswith(suffix):
                            try:
                                number = float(clean_text[:-1])
                                return int(number * multiplier)
                            except:
                                break

                    # Try direct conversion
                    try:
                        return int(float(clean_text))
                    except:
                        return text
                else:
                    # Price data
                    try:
                        return float(clean_text)
                    except:
                        return text

            # Create driver and scrape
            driver = webdriver.Chrome(options=chrome_options)
            driver.set_page_load_timeout(30)

            try:
                # Load page
                driver.get(url)
                time.sleep(10)  # Wait for dynamic content

                # Wait for main content
                wait = WebDriverWait(driver, 15)
                wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "#js-category-content")))

                result = {
                    'symbol': symbol_key,
                    'source': 'tradingview_futures',
                    'url': url,
                    'timestamp': datetime.now().isoformat(),
                    'extraction_method': 'selenium'
                }

                # Extract data using precise selectors
                for field_name, selector in selectors.items():
                    try:
                        element = driver.find_element(By.CSS_SELECTOR, selector)
                        raw_text = element.text.strip()

                        if raw_text:
                            cleaned_value = clean_financial_data(raw_text, field_name)
                            result[field_name] = cleaned_value
                            result[f'{field_name}_raw'] = raw_text

                    except Exception as e:
                        # Try fallback selectors (from tradingview-scraper.ts)
                        if field_name in fallback_selectors:
                            for fallback_selector in fallback_selectors[field_name]:
                                try:
                                    elements = driver.find_elements(By.CSS_SELECTOR, fallback_selector)
                                    for elem in elements[:3]:
                                        text = elem.text.strip()
                                        if text and any(c.isdigit() for c in text):
                                            cleaned_value = clean_financial_data(text, field_name)
                                            if cleaned_value is not None:
                                                result[field_name] = cleaned_value
                                                result[f'{field_name}_raw'] = text
                                                result[f'{field_name}_fallback'] = True
                                                break
                                    else:
                                        continue
                                    break
                                except:
                                    continue

                # Calculate change if we have current price and previous close
                if 'current_price' in result and 'previous_close' in result:
                    try:
                        current = result['current_price']
                        prev = result['previous_close']

                        if isinstance(current, (int, float)) and isinstance(prev, (int, float)) and prev != 0:
                            change = current - prev
                            change_percent = (change / prev) * 100

                            result['change'] = change
                            result['change_percent'] = change_percent

                    except Exception as e:
                        result['calculation_error'] = str(e)

                result['success'] = 'current_price' in result

                return result

            finally:
                driver.quit()

        except Exception as e:
            import traceback
            return {
                'symbol': symbol_key,
                'error': f'TradingView scraping failed: {str(e)}',
                'error_details': traceback.format_exc(),
                'source': 'tradingview_futures',
                'timestamp': datetime.now().isoformat()
            }

    def search_symbols(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Search for symbols using both tvscreener and yfinance separately"""
        results = []

        # 1. Search using tvscreener
        tvscreener_results = []
        if TVSCREENER_AVAILABLE:
            try:
                # Search in different screeners
                screeners = [
                    ('stocks', tvs.StockScreener()),
                    ('crypto', tvs.CryptoScreener()),
                    ('forex', tvs.ForexScreener())
                ]

                for market_type, screener in screeners:
                    try:
                        df = screener.get()

                        if not df.empty:
                            # Search in Symbol and Description/Name columns
                            mask = pd.Series([False] * len(df))

                            if 'Symbol' in df.columns:
                                mask |= df['Symbol'].str.contains(query, case=False, na=False)
                            if 'Description' in df.columns:
                                mask |= df['Description'].str.contains(query, case=False, na=False)
                            if 'Name' in df.columns:
                                mask |= df['Name'].str.contains(query, case=False, na=False)

                            filtered = df[mask].head(limit // 4)  # Reserve space for yfinance results

                            for _, row in filtered.iterrows():
                                tvscreener_results.append({
                                    'symbol': str(row.get('Symbol', '')),
                                    'name': str(row.get('Description', row.get('Name', ''))),
                                    'price': float(row.get('Price', 0)),
                                    'change': float(row.get('Change', 0)),
                                    'change_percent': float(str(row.get('Change %', '0')).replace('%', '').replace('+', '') or 0),
                                    'market': market_type,
                                    'type': market_type,
                                    'data_source': 'tvscreener'
                                })

                    except Exception as e:
                        continue

            except Exception as e:
                pass

        # 2. Search using yfinance (try common symbol formats)
        yfinance_results = []
        if YFINANCE_AVAILABLE:
            try:
                # Generate potential symbol formats for the query
                search_variants = [
                    query,
                    query.upper(),
                    f"{query}.T",  # Tokyo Stock Exchange format
                    f"{query}.TO",  # Toronto format
                    f"{query}.L",   # London format
                    f"{query}=X",   # Forex format
                    f"^{query}",    # Index format
                ]

                # Add some specific Japanese stock formats for numeric queries
                if query.isdigit():
                    search_variants.extend([
                        f"{query}.T",
                        f"{int(query):04d}.T",  # 4-digit padding
                    ])

                found_symbols = set()  # Track found symbols to avoid duplicates

                for variant in search_variants:
                    try:
                        ticker = yf.Ticker(variant)

                        # Get basic info to verify symbol exists
                        info = ticker.info
                        hist = ticker.history(period="2d")

                        if not hist.empty and info and 'symbol' in info:
                            # Use the actual symbol from info to avoid duplicates
                            actual_symbol = info.get('symbol', variant)

                            # Skip if we already found this symbol
                            if actual_symbol in found_symbols:
                                continue

                            found_symbols.add(actual_symbol)

                            current_price = hist['Close'].iloc[-1] if len(hist) > 0 else 0
                            prev_close = hist['Close'].iloc[-2] if len(hist) > 1 else current_price
                            change = current_price - prev_close
                            change_percent = (change / prev_close * 100) if prev_close != 0 else 0

                            yfinance_results.append({
                                'symbol': actual_symbol,
                                'name': info.get('longName', info.get('shortName', actual_symbol)),
                                'price': float(current_price),
                                'change': float(change),
                                'change_percent': float(change_percent),
                                'market': 'yfinance',
                                'type': info.get('quoteType', 'unknown'),
                                'data_source': 'yfinance',
                                'exchange': info.get('exchange', ''),
                                'currency': info.get('currency', '')
                            })

                    except Exception as e:
                        # Silent continue for variant testing
                        continue

            except Exception as e:
                pass

        # 3. Combine results with data source attribution
        results = []

        # Add tvscreener results
        for result in tvscreener_results:
            results.append(result)

        # Add yfinance results
        for result in yfinance_results:
            results.append(result)

        return results[:limit]

    def get_technical_indicators(self, symbols: List[str], indicator_types: List[str], timeframe: int = 30) -> List[Dict[str, Any]]:
        """Get technical indicators for symbols"""
        if not YFINANCE_AVAILABLE:
            return [{'error': 'yfinance not available for indicator calculation'}]

        indicators = []

        for symbol in symbols:
            try:
                ticker = yf.Ticker(symbol)
                df = ticker.history(period=f"{timeframe}d")

                if len(df) > 1:
                    calculated = self.ti.calculate_all_indicators(df, indicator_types)

                    for indicator_name, value in calculated.items():
                        signal = self.ti.get_signal(indicator_name, value, float(df['Close'].iloc[-1]))

                        indicators.append({
                            'symbol': symbol,
                            'indicator_name': indicator_name,
                            'value': float(value),
                            'signal': signal,
                            'timeframe': f'{timeframe}d',
                            'calculation_time': datetime.now().isoformat()
                        })

            except Exception as e:
                indicators.append({
                    'symbol': symbol,
                    'error': str(e),
                    'indicator_name': 'error',
                    'value': 0,
                    'calculation_time': datetime.now().isoformat()
                })

        return indicators

# Execute operation
api = MarketDataAPI()
operation = "${op}"
data_source = "${dataSourceValue}"

try:
    if operation == "get_quote":
        if not ${symbolsStr} or len(${symbolsStr}) == 0:
            result = {"error": "No symbols provided. Please specify 'symbols' parameter (e.g., ['AAPL', 'GOOGL', '^N225'])"}
        else:
            symbols = ${symbolsStr}
            quotes = api.get_quotes_with_source(symbols, data_source, ${includeIndicators}, ${indicatorTypesStr})
            summary = f"Retrieved quotes for {len([q for q in quotes if not q.get('error')])} symbols"
            result = {"quotes": quotes, "summary": summary}

    elif operation == "get_historical":
        # Handle index_types parameter for historical data
        symbols = []
        if ${indexTypesStr} and len(${indexTypesStr}) > 0:
            # Convert index types to yfinance symbols
            for idx_type in ${indexTypesStr}:
                if idx_type in api.index_symbols:
                    symbols.append(api.index_symbols[idx_type]['yf'])
                else:
                    # Invalid index type - provide available options
                    available_indices = list(api.index_symbols.keys())
                    error_msg = f"Invalid index type: '{idx_type}'. Available indices: {', '.join(available_indices)}"
                    result = {"error": error_msg, "available_indices": available_indices}
                    break
        elif ${symbolsStr} and len(${symbolsStr}) > 0:
            symbols = ${symbolsStr}
        else:
            # No symbols provided
            result = {"error": "No symbols or index_types provided. Please specify either 'symbols' (e.g., ['AAPL', 'GOOGL']) or 'index_types' (e.g., ['SP500', 'NASDAQ'])"}

        if symbols:
            bars = api.get_historical_data_with_source(symbols, data_source, "${intervalValue}", "${periodValue}", ${includeIndicators}, ${indicatorTypesStr})
            summary = f"Retrieved {len([b for b in bars if not b.get('error')])} historical bars"
            result = {"bars": bars, "summary": summary}

    elif operation == "search_symbols":
        query = "${searchQueryValue}" or "apple"
        search_results = api.search_symbols(query, ${limitValue})
        summary = f"Found {len([r for r in search_results if not r.get('error')])} symbols matching '{query}'"
        result = {"search_results": search_results, "summary": summary, "search_query": query}

    elif operation == "get_indices":
        index_types = ${indexTypesStr} or ["SP500", "NASDAQ", "NIKKEI225"]
        indices = api.get_indices_data(index_types, ${includeIndicators}, ${indicatorTypesStr})
        summary = f"Retrieved data for {len([i for i in indices if not i.get('error')])} indices"
        result = {"indices": indices, "summary": summary}

    elif operation == "screen_stocks":
        markets = ${marketsStr} or ["america"]
        filters = ${screenerFiltersStr}
        screener_results = api.screen_stocks(markets, filters, "${sortByValue}", ${sortOrderValue}, ${limitValue})
        summary = f"Screened {len([r for r in screener_results if not r.get('error')])} stocks"
        result = {"screener_results": screener_results, "summary": summary}

    elif operation == "get_technical_indicators":
        if not ${symbolsStr} or len(${symbolsStr}) == 0:
            result = {"error": "No symbols provided. Please specify 'symbols' parameter (e.g., ['AAPL', 'GOOGL', '^N225'])"}
        else:
            symbols = ${symbolsStr}
            indicator_types = ${indicatorTypesStr} or ["RSI", "MACD", "SMA"]
            technical_indicators = api.get_technical_indicators(symbols, indicator_types, ${timeframeValue})
            summary = f"Calculated {len([t for t in technical_indicators if not t.get('error')])} technical indicators"
            result = {"technical_indicators": technical_indicators, "summary": summary}

    elif operation == "get_n225":
        # Get N225 data combining futures (TradingView) and spot (API)
        futures_data = api.scrape_tradingview_data('N225')
        spot_data = api._get_quote_yfinance('^N225', ${includeIndicators}, ${indicatorTypesStr})

        result = {
            "n225_data": {
                "futures": futures_data,
                "spot": spot_data,
                "symbol": "N225",
                "name": "Nikkei 225"
            },
            "summary": f"Retrieved N225 futures and spot data"
        }

    elif operation == "get_sp500":
        # Get SP500 data combining futures (TradingView) and spot (API)
        futures_data = api.scrape_tradingview_data('SP500')
        spot_data = api._get_quote_yfinance('^GSPC', ${includeIndicators}, ${indicatorTypesStr})

        result = {
            "sp500_data": {
                "futures": futures_data,
                "spot": spot_data,
                "symbol": "SP500",
                "name": "S&P 500 Index"
            },
            "summary": f"Retrieved SP500 futures and spot data"
        }

    elif operation == "get_nasdaq":
        # Get NASDAQ data combining futures (TradingView) and spot (API)
        futures_data = api.scrape_tradingview_data('NASDAQ')
        spot_data = api._get_quote_yfinance('^IXIC', ${includeIndicators}, ${indicatorTypesStr})

        result = {
            "nasdaq_data": {
                "futures": futures_data,
                "spot": spot_data,
                "symbol": "NASDAQ",
                "name": "NASDAQ Composite"
            },
            "summary": f"Retrieved NASDAQ futures and spot data"
        }

    elif operation == "get_usdjpy":
        # Get USD/JPY data from TradingView
        usdjpy_data = api.scrape_tradingview_data('USDJPY')

        result = {
            "usdjpy_data": {
                "forex": usdjpy_data,
                "symbol": "USDJPY",
                "name": "USD/JPY Currency Pair"
            },
            "summary": f"Retrieved USD/JPY forex data"
        }

    else:
        result = {"summary": f"Unknown operation: {operation}", "error": "Invalid operation"}

except Exception as e:
    result = {"summary": f"Operation failed: {str(e)}", "error": str(e)}

# Add metadata
result["metadata"] = {
    "operation": operation,
    "tvscreener_available": TVSCREENER_AVAILABLE,
    "yfinance_available": YFINANCE_AVAILABLE,
    "ta_available": TA_AVAILABLE,
    "selenium_available": SELENIUM_AVAILABLE,
    "timestamp": datetime.now().isoformat()
}

print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
`;
  }

  protected parseResult(pythonOutput: string, params: MarketDataTool3Params): MarketDataTool3Result {
    try {
      if (!pythonOutput.trim()) {
        return {
          llmContent: 'No output result',
          returnDisplay: '❌ No output result',
        };
      }

      // Extract JSON from output
      const jsonMatch = pythonOutput.match(/\{[\s\S]*\}$/m);
      if (!jsonMatch) {
        return {
          llmContent: `Raw output:\n${pythonOutput}`,
          returnDisplay: '⚠️ Unable to parse JSON result',
        };
      }

      const data = JSON.parse(jsonMatch[0].trim());
      const { quotes, bars, search_results, screener_results, indices, technical_indicators,
              n225_data, sp500_data, nasdaq_data, usdjpy_data,
              summary, metadata, error } = data;

      if (error) {
        return {
          llmContent: `Error: ${error}\n\nSummary: ${summary}`,
          returnDisplay: `❌ ${summary}`,
        };
      }

      let displayContent = `## ${summary}\n\n`;

      // Check library availability
      if (metadata) {
        const availability = [];
        if (metadata.tvscreener_available) availability.push('✅ tvscreener');
        else availability.push('❌ tvscreener');
        if (metadata.yfinance_available) availability.push('✅ yfinance');
        else availability.push('❌ yfinance');

        displayContent += `**Data Sources**: ${availability.join(', ')}\n\n`;
      }

      // Format real-time quotes
      if (quotes && quotes.length > 0) {
        displayContent += '### 📈 Real-time Quotes\n\n';
        displayContent += '| Symbol | Price | Change | Change % | Volume | Market Cap | P/E | Source |\n';
        displayContent += '|--------|-------|--------|----------|--------|------------|-----|--------|\n';

        for (const quote of quotes) {
          if (quote.error) {
            displayContent += `| **${quote.symbol}** | ❌ ${quote.error} | - | - | - | - | - | - |\n`;
          } else {
            const changeSign = quote.change >= 0 ? '+' : '';
            const changePercentSign = quote.change_percent >= 0 ? '+' : '';
            const price = quote.price > 0 ? `$${quote.price.toFixed(2)}` : 'N/A';
            const change = quote.change !== undefined ? `${changeSign}${quote.change.toFixed(2)}` : 'N/A';
            const changePercent = quote.change_percent !== undefined ? `${changePercentSign}${quote.change_percent.toFixed(2)}%` : 'N/A';
            const volume = quote.volume > 0 ? quote.volume.toLocaleString() : 'N/A';
            const marketCap = quote.market_cap ? `$${(quote.market_cap / 1e9).toFixed(1)}B` : 'N/A';
            const peRatio = quote.pe_ratio ? quote.pe_ratio.toFixed(1) : 'N/A';

            displayContent += `| **${quote.symbol}** | ${price} | ${change} | ${changePercent} | ${volume} | ${marketCap} | ${peRatio} | ${quote.source} |\n`;
          }
        }
        displayContent += '\n';

        // Show technical indicators if present
        const quotesWithIndicators = quotes.filter((q: QuoteData) => q.indicators && Object.keys(q.indicators).length > 0);
        if (quotesWithIndicators.length > 0) {
          displayContent += '#### 📊 Technical Indicators\n\n';
          for (const quote of quotesWithIndicators) {
            const indicators = quote.indicators || {};
            displayContent += `**${quote.symbol}**:\n`;

            Object.entries(indicators).forEach(([key, value]) => {
              displayContent += `- ${key}: ${typeof value === 'number' ? value.toFixed(2) : value}\n`;
            });
            displayContent += '\n';
          }
        }
      }

      // Format historical data
      if (bars && bars.length > 0) {
        displayContent += '### 📊 Historical Data\n\n';
        displayContent += `*Showing latest 10 bars of ${bars.length} total*\n\n`;
        displayContent += '| Symbol | DateTime | Open | High | Low | Close | Volume |\n';
        displayContent += '|--------|----------|------|------|-----|-------|--------|\n';

        const recentBars = bars.slice(-10);
        for (const bar of recentBars) {
          if (bar.error) {
            displayContent += `| **${bar.symbol}** | ❌ ${bar.error} | - | - | - | - | - |\n`;
          } else {
            const datetime = new Date(bar.datetime).toLocaleString();
            displayContent += `| ${bar.symbol} | ${datetime} | ${bar.open.toFixed(2)} | ${bar.high.toFixed(2)} | ${bar.low.toFixed(2)} | ${bar.close.toFixed(2)} | ${bar.volume.toLocaleString()} |\n`;
          }
        }
        displayContent += '\n';

        // Show technical indicators for historical data if present
        const barsWithIndicators = bars.filter((b: HistoricalBar) => b.indicators && Object.keys(b.indicators).length > 0);
        if (barsWithIndicators.length > 0) {
          displayContent += '#### 📊 Technical Indicators (Latest)\n\n';
          for (const bar of barsWithIndicators) {
            const indicators = bar.indicators || {};
            displayContent += `**${bar.symbol}** (${new Date(bar.datetime).toLocaleDateString()}):\n`;

            Object.entries(indicators).forEach(([key, value]) => {
              displayContent += `- ${key}: ${typeof value === 'number' ? value.toFixed(2) : value}\n`;
            });
            displayContent += '\n';
          }
        }
      }

      // Format search results
      if (search_results && search_results.length > 0) {
        displayContent += '### 🔍 Symbol Search Results\n\n';
        displayContent += '| Symbol | Name | Price | Change % | Market |\n';
        displayContent += '|--------|------|-------|----------|--------|\n';

        for (const result of search_results.slice(0, 15)) {
          if (result.error) {
            displayContent += `| ❌ ${result.error} | - | - | - | - |\n`;
          } else {
            const changePercentSign = result.change_percent >= 0 ? '+' : '';
            const price = result.price ? `$${result.price.toFixed(2)}` : 'N/A';
            const changePercent = result.change_percent !== undefined ? `${changePercentSign}${result.change_percent.toFixed(2)}%` : 'N/A';
            const name = result.name.length > 30 ? result.name.slice(0, 30) + '...' : result.name;

            displayContent += `| **${result.symbol}** | ${name} | ${price} | ${changePercent} | ${result.market} |\n`;
          }
        }
        displayContent += '\n';
      }

      // Format screener results
      if (screener_results && screener_results.length > 0) {
        displayContent += '### 📊 Stock Screener Results\n\n';
        displayContent += '| Symbol | Name | Price | Change % | Volume | Market Cap | P/E | Sector |\n';
        displayContent += '|--------|------|-------|----------|--------|------------|-----|--------|\n';

        for (const result of screener_results.slice(0, 20)) {
          if (result.error) {
            displayContent += `| ❌ ${result.error} | - | - | - | - | - | - | - |\n`;
          } else {
            const changePercentSign = result.change_percent >= 0 ? '+' : '';
            const price = result.price ? `$${result.price.toFixed(2)}` : 'N/A';
            const changePercent = result.change_percent !== undefined ? `${changePercentSign}${result.change_percent.toFixed(2)}%` : 'N/A';
            const volume = result.volume > 0 ? result.volume.toLocaleString() : 'N/A';
            const marketCap = result.market_cap > 0 ? `$${(result.market_cap / 1e9).toFixed(1)}B` : 'N/A';
            const peRatio = result.pe_ratio ? result.pe_ratio.toFixed(1) : 'N/A';
            const name = result.name.length > 25 ? result.name.slice(0, 25) + '...' : result.name;

            displayContent += `| **${result.symbol}** | ${name} | ${price} | ${changePercent} | ${volume} | ${marketCap} | ${peRatio} | ${result.sector} |\n`;
          }
        }
        displayContent += '\n';
      }

      // Format indices data
      if (indices && indices.length > 0) {
        displayContent += '### 📊 Major Indices\n\n';
        displayContent += '| Index | Price | Change | Change % | Volume | Source |\n';
        displayContent += '|-------|-------|--------|----------|--------|--------|\n';

        for (const index of indices) {
          if (index.error) {
            displayContent += `| **${index.name || index.symbol}** | ❌ ${index.error} | - | - | - | - |\n`;
          } else {
            const changeSign = index.change >= 0 ? '+' : '';
            const changePercentSign = index.change_percent >= 0 ? '+' : '';
            const price = `$${index.price.toFixed(2)}`;
            const change = `${changeSign}${index.change.toFixed(2)}`;
            const changePercent = `${changePercentSign}${index.change_percent.toFixed(2)}%`;
            const volume = index.volume > 0 ? index.volume.toLocaleString() : 'N/A';

            displayContent += `| **${index.name}** | ${price} | ${change} | ${changePercent} | ${volume} | ${index.source} |\n`;
          }
        }
        displayContent += '\n';

        // Show indicators for indices if present
        const indicesWithIndicators = indices.filter((i: IndexData) => i.indicators && Object.keys(i.indicators).length > 0);
        if (indicesWithIndicators.length > 0) {
          displayContent += '#### 📊 Index Technical Indicators\n\n';
          for (const index of indicesWithIndicators) {
            displayContent += `**${index.name}**:\n`;
            Object.entries(index.indicators || {}).forEach(([key, value]) => {
              displayContent += `- ${key}: ${typeof value === 'number' ? value.toFixed(2) : value}\n`;
            });
            displayContent += '\n';
          }
        }
      }

      // Format technical indicators
      if (technical_indicators && technical_indicators.length > 0) {
        displayContent += '### 📊 Technical Analysis\n\n';
        displayContent += '| Symbol | Indicator | Value | Signal | Timeframe |\n';
        displayContent += '|--------|-----------|-------|--------|----------|\n';

        for (const indicator of technical_indicators) {
          if (indicator.error) {
            displayContent += `| **${indicator.symbol}** | ❌ ${indicator.error} | - | - | - |\n`;
          } else {
            const signalEmoji = indicator.signal === 'BUY' ? '🟢' : indicator.signal === 'SELL' ? '🔴' : '🟡';
            const value = typeof indicator.value === 'number' ? indicator.value.toFixed(4) : indicator.value;

            displayContent += `| **${indicator.symbol}** | ${indicator.indicator_name} | ${value} | ${signalEmoji} ${indicator.signal} | ${indicator.timeframe} |\n`;
          }
        }
        displayContent += '\n';
      }

      // Format index-specific data (get_n225, get_sp500, get_nasdaq, get_usdjpy)
      if (n225_data || sp500_data || nasdaq_data || usdjpy_data) {
        const indexData = n225_data || sp500_data || nasdaq_data || usdjpy_data;
        displayContent += '### 📈 Market Data\n\n';

        // Display futures data if available
        if (indexData.futures && !indexData.futures.error) {
          displayContent += '**Futures Data (TradingView)**:\n';
          if (indexData.futures.current_price) {
            displayContent += `- Current Price: ${indexData.futures.current_price}\n`;
          }
          if (indexData.futures.previous_close) {
            displayContent += `- Previous Close: ${indexData.futures.previous_close}\n`;
          }
          if (indexData.futures.change) {
            displayContent += `- Change: ${indexData.futures.change.toFixed(2)} (${indexData.futures.change_percent?.toFixed(2)}%)\n`;
          }
          if (indexData.futures.volume) {
            displayContent += `- Volume: ${indexData.futures.volume.toLocaleString()}\n`;
          }
          displayContent += '\n';
        } else if (indexData.futures?.status === 'selenium_not_available') {
          displayContent += '**Futures Data**: ⚠️ TradingView scraping not available (Selenium not installed)\n\n';
        } else if (indexData.futures?.note) {
          displayContent += `**Futures Data**: ⚠️ ${indexData.futures.note}\n\n`;
        } else if (indexData.futures?.error) {
          displayContent += `**Futures Data**: ❌ ${indexData.futures.error}\n`;
          if (indexData.futures?.error_details) {
            displayContent += `\n**Error Details**:\n\`\`\`\n${indexData.futures.error_details}\n\`\`\`\n\n`;
          } else {
            displayContent += '\n';
          }
        }

        // Display spot data if available
        if (indexData.spot && !indexData.spot.error) {
          displayContent += '**Spot Data (API)**:\n';
          displayContent += `- Current Price: ${indexData.spot.price?.toFixed(2) || 'N/A'}\n`;
          displayContent += `- Change: ${indexData.spot.change?.toFixed(2) || 'N/A'} (${indexData.spot.change_percent?.toFixed(2) || 'N/A'}%)\n`;
          displayContent += `- Volume: ${indexData.spot.volume?.toLocaleString() || 'N/A'}\n`;
          if (indexData.spot.indicators) {
            displayContent += '\n**Technical Indicators**:\n';
            Object.entries(indexData.spot.indicators).forEach(([key, value]) => {
              displayContent += `- ${key}: ${typeof value === 'number' ? value.toFixed(2) : value}\n`;
            });
          }
          displayContent += '\n';
        }

        // Display forex data for USDJPY
        if (indexData.forex) {
          if (!indexData.forex.error) {
            displayContent += '**Forex Data**:\n';
            displayContent += `- Symbol: ${indexData.symbol}\n`;
            displayContent += `- Name: ${indexData.name}\n`;
            if (indexData.forex.current_price) {
              displayContent += `- Current Price: ${indexData.forex.current_price}\n`;
            }
            if (indexData.forex.change) {
              displayContent += `- Change: ${indexData.forex.change.toFixed(4)} (${indexData.forex.change_percent?.toFixed(2)}%)\n`;
            }
          } else {
            displayContent += `**Forex Data**: ❌ ${indexData.forex.error}\n`;
          }
          displayContent += '\n';
        }

        // Calculate spread if both futures and spot are available
        if (indexData.futures?.current_price && indexData.spot?.price) {
          const spread = indexData.futures.current_price - indexData.spot.price;
          displayContent += `**Futures-Spot Spread**: ${spread.toFixed(2)}\n\n`;
        }
      }


      displayContent += '\n*🚀 **Powered by**: tvscreener (real-time screening) + yfinance (historical data & indicators)*\n';

      return {
        llmContent: displayContent,
        returnDisplay: displayContent,
        structuredData: {
          operation: params.op,
          summary,
          details: { quotes, bars, search_results, screener_results, indices, technical_indicators,
                    n225_data, sp500_data, nasdaq_data, usdjpy_data, metadata }
        },
      };

    } catch (error) {
      return {
        llmContent: `Failed to parse result: ${error}\n\nRaw output:\n${pythonOutput}`,
        returnDisplay: `❌ Failed to parse result: ${error}`,
      };
    }
  }
}