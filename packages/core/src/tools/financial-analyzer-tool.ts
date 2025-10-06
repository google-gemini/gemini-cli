/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { ToolResult } from './tools.js';
import type { VisualizationData, ToolResponseData } from '../providers/types.js';
import { BasePythonTool } from './base-python-tool.js';

export interface FinancialAnalyzerParams {
  op: 'get_quote' | 'get_historical' | 'search_symbols' | 'screen_stocks' | 'get_technical_indicators' | 'get_n225' | 'get_sp500' | 'get_nasdaq' | 'get_usdjpy'
    | 'rolling_stats' | 'correlation_matrix' | 'regression_analysis' | 'var_analysis' | 'portfolio_optimization' | 'garch_model' | 'sharpe_ratio';
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
  index_types?: string[];  // For get_indices operation

  // === Financial Analysis Parameters ===
  // Rolling statistics
  window?: number;  // Rolling window size (e.g., 30, 60)
  stat_type?: 'mean' | 'std' | 'var' | 'corr' | 'beta';

  // Regression analysis
  benchmark?: string;  // Benchmark symbol for regression (e.g., 'SPY', '^GSPC')
  factors?: string[];  // Multi-factor regression

  // VaR analysis
  confidence_level?: number;  // 0.95, 0.99
  var_method?: 'historical' | 'parametric' | 'monte_carlo';

  // Portfolio optimization
  target_return?: number;
  risk_free_rate?: number;
  constraints?: Record<string, unknown>;

  // GARCH model
  forecast_periods?: number;
  garch_p?: number;  // GARCH(p,q) p parameter
  garch_q?: number;  // GARCH(p,q) q parameter
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

interface FinancialAnalyzerResult extends ToolResult {
  data?: {
    quotes?: QuoteData[];
    bars?: HistoricalBar[];
    screener_results?: ScreenerResult[];
    indices?: IndexData[];
    technical_indicators?: TechnicalIndicator[];

    // Financial analysis results
    rolling_stats?: Record<string, number[]>;
    correlation_matrix?: number[][];
    regression?: {
      alpha: number;
      beta: number | number[];
      r_squared: number;
      p_values: number[];
      residuals?: number[];
    };
    var_analysis?: {
      var: number;
      cvar: number;
      method: string;
      confidence: number;
    };
    portfolio?: {
      weights: number[];
      expected_return: number;
      volatility: number;
      sharpe_ratio?: number;
    };
    garch?: {
      omega: number;
      alpha: number[];
      beta: number[];
      current_volatility: number;
      forecast: number[];
      aic?: number;
      bic?: number;
    };
    sharpe?: number;

    summary: string;
    metadata?: Record<string, unknown>;
  };
  structuredData?: ToolResponseData;
}

export class FinancialAnalyzer extends BasePythonTool<FinancialAnalyzerParams, FinancialAnalyzerResult> {
  static readonly Name: string = 'financial_analyzer';
  constructor(config: Config) {
    super(
      'financial_analyzer',
      'Financial Analyzer - Market Data & Statistical Analysis',
      `Comprehensive financial analysis tool combining market data retrieval and advanced statistical analysis.

# DATA OPERATIONS
- op='get_quote': Get real-time quotes for stocks/crypto/forex
- op='get_historical': Get historical OHLC price data
- op='search_symbols': Search for stock symbols by name/keyword
- op='screen_stocks': Screen stocks by criteria (market cap, PE ratio, etc.)
- op='get_technical_indicators': Calculate technical indicators (RSI, MACD, etc.)
- op='get_n225': Get Nikkei 225 index data
- op='get_sp500': Get S&P 500 index data
- op='get_nasdaq': Get NASDAQ Composite index data
- op='get_usdjpy': Get USD/JPY forex rate

# STATISTICAL ANALYSIS OPERATIONS (Data retrieved internally)
- op='rolling_stats': Calculate rolling statistics (mean, std, correlation)
  Required: symbols, period, window, stat_type
- op='correlation_matrix': Compute correlation matrix for multiple assets
  Required: symbols, period
- op='regression_analysis': Perform regression analysis (CAPM, multi-factor)
  Required: symbols, period, benchmark (e.g., 'SPY')
- op='var_analysis': Calculate Value at Risk (VaR) and CVaR
  Required: symbols, period, confidence_level (0.95/0.99), var_method
- op='portfolio_optimization': Optimize portfolio weights (Markowitz)
  Required: symbols, period, target_return (optional), risk_free_rate
- op='garch_model': Fit GARCH model for volatility forecasting
  Required: symbols, period, forecast_periods
- op='sharpe_ratio': Calculate Sharpe ratio
  Required: symbols, period, risk_free_rate

# IMPORTANT NOTES
- Statistical operations fetch data internally - DO NOT fetch data separately
- Always verify symbols with search_symbols if unsure
- Default period is 1y for analysis operations
      `,
      ['tvscreener', 'pandas', 'numpy', 'yfinance', 'ta', 'selenium', 'scipy', 'statsmodels', 'arch'],
      {
        type: 'object',
        properties: {
          op: {
            type: 'string',
            enum: [
              'get_quote', 'get_historical', 'search_symbols', 'screen_stocks', 'get_technical_indicators',
              'get_n225', 'get_sp500', 'get_nasdaq', 'get_usdjpy',
              'rolling_stats', 'correlation_matrix', 'regression_analysis', 'var_analysis',
              'portfolio_optimization', 'garch_model', 'sharpe_ratio'
            ],
            description: `Operation type:
DATA: get_quote, get_historical, search_symbols, screen_stocks, get_technical_indicators, get_n225, get_sp500, get_nasdaq, get_usdjpy
ANALYSIS: rolling_stats, correlation_matrix, regression_analysis, var_analysis, portfolio_optimization, garch_model, sharpe_ratio`,
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
            description: 'Technical indicators: SMA, EMA, RSI, MACD, Bollinger, Stochastic, ADX, ATR, VWAP, OBV, Williams_R, CCI, ROC',
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

          // === Financial Analysis Parameters ===
          window: {
            type: 'number',
            description: 'Rolling window size for rolling_stats (e.g., 30, 60 days)',
          },
          stat_type: {
            type: 'string',
            enum: ['mean', 'std', 'var', 'corr', 'beta'],
            description: 'Type of rolling statistic to calculate',
          },
          benchmark: {
            type: 'string',
            description: 'Benchmark symbol for regression analysis (e.g., SPY, ^GSPC)',
          },
          factors: {
            type: 'array',
            items: { type: 'string' },
            description: 'Factor symbols for multi-factor regression',
          },
          confidence_level: {
            type: 'number',
            description: 'Confidence level for VaR analysis (0.95 or 0.99)',
          },
          var_method: {
            type: 'string',
            enum: ['historical', 'parametric', 'monte_carlo'],
            description: 'Method for VaR calculation',
          },
          target_return: {
            type: 'number',
            description: 'Target return for portfolio optimization (annual return)',
          },
          risk_free_rate: {
            type: 'number',
            description: 'Risk-free rate for Sharpe ratio and portfolio optimization (default: 0.02)',
          },
          constraints: {
            type: 'object',
            description: 'Portfolio constraints (max_weight, min_weight, sector_limits, etc.)',
          },
          forecast_periods: {
            type: 'number',
            description: 'Number of periods to forecast for GARCH model (default: 5)',
          },
          garch_p: {
            type: 'number',
            description: 'GARCH(p,q) p parameter (default: 1)',
          },
          garch_q: {
            type: 'number',
            description: 'GARCH(p,q) q parameter (default: 1)',
          },
        },
        required: ['op'],
      },
      config,
      true,
      false,
    );
  }

  protected override requiresConfirmation(_params: FinancialAnalyzerParams): boolean {
    // Financial analyzer only reads market data, no confirmation needed
    return false;
  }

  protected generatePythonCode(params: FinancialAnalyzerParams): string {
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
      // Financial analysis parameters
      window,
      stat_type,
      benchmark,
      factors,
      confidence_level,
      var_method,
      target_return,
      risk_free_rate,
      forecast_periods,
      garch_p,
      garch_q,
    } = params;

    const symbolsStr = symbols ? JSON.stringify(symbols) : '[]';
    const dataSourceValue = data_source || 'auto';
    const marketsStr = markets ? JSON.stringify(markets) : '[]';
    const intervalValue = interval || '1d';
    const periodValue = period || '1mo';
    const timeframeValue = timeframe || 60;  // Increased to 60 days for MACD calculation
    const searchQueryValue = search_query || '';
    const includeIndicators = include_indicators ? 'True' : 'False';
    const indicatorTypesStr = indicator_types ? JSON.stringify(indicator_types) : '[]';
    const screenerFiltersStr = screener_filters ? JSON.stringify(screener_filters) : '{}';
    const sortByValue = sort_by || 'Market Capitalization';
    const sortOrderValue = sort_order === 'asc' ? 'True' : 'False';
    const limitValue = limit || 50;
    const indexTypesStr = index_types ? JSON.stringify(index_types) : '[]';

    // Financial analysis parameter conversions
    const windowValue = window || 30;
    const statTypeValue = stat_type || 'mean';
    const benchmarkValue = benchmark || '';
    const factorsStr = factors ? JSON.stringify(factors) : '[]';
    const confidenceLevelValue = confidence_level || 0.95;
    const varMethodValue = var_method || 'historical';
    const targetReturnValue = target_return || 0.0;
    const riskFreeRateValue = risk_free_rate || 0.0;
    const forecastPeriodsValue = forecast_periods || 5;
    const garchPValue = garch_p || 1;
    const garchQValue = garch_q || 1;

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

# Statistical analysis libraries
try:
    from scipy import stats
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False

try:
    import statsmodels.api as sm
    from statsmodels.regression.linear_model import OLS
    STATSMODELS_AVAILABLE = True
except ImportError:
    STATSMODELS_AVAILABLE = False

try:
    from arch import arch_model
    ARCH_AVAILABLE = True
except ImportError:
    ARCH_AVAILABLE = False

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
    """Advanced technical indicator calculations using ta library"""

    @staticmethod
    def calculate_all_indicators(df: pd.DataFrame, indicator_types: List[str]) -> Dict[str, float]:
        """Calculate all requested technical indicators using ta library"""
        indicators = {}

        if len(df) < 2:
            return indicators

        try:
            # Standardize column names for ta library
            if 'Close' in df.columns:
                df = df.rename(columns={'Close': 'close', 'High': 'high', 'Low': 'low', 'Volume': 'volume', 'Open': 'open'})

            close = df['close']
            high = df['high'] if 'high' in df.columns else close
            low = df['low'] if 'low' in df.columns else close
            volume = df['volume'] if 'volume' in df.columns else pd.Series([1] * len(df))
            open_price = df['open'] if 'open' in df.columns else close

            # Use ta library for all calculations
            if not TA_AVAILABLE:
                # Fallback to basic calculations if ta library not available
                return TechnicalIndicators._calculate_basic_indicators(df, indicator_types)

            for indicator in indicator_types:
                try:
                    if indicator == 'SMA' and len(close) >= 20:
                        indicators['SMA_20'] = float(ta.trend.sma_indicator(close, window=20).iloc[-1])
                        if len(close) >= 50:
                            indicators['SMA_50'] = float(ta.trend.sma_indicator(close, window=50).iloc[-1])

                    elif indicator == 'EMA' and len(close) >= 20:
                        indicators['EMA_20'] = float(ta.trend.ema_indicator(close, window=20).iloc[-1])
                        if len(close) >= 50:
                            indicators['EMA_50'] = float(ta.trend.ema_indicator(close, window=50).iloc[-1])

                    elif indicator == 'RSI' and len(close) >= 14:
                        rsi_indicator = ta.momentum.RSIIndicator(close, window=14)
                        indicators['RSI'] = float(rsi_indicator.rsi().iloc[-1])

                    elif indicator == 'MACD' and len(close) >= 35:
                        # MACD requires more data for stable calculation (26-period EMA + 9-period signal line)
                        macd_indicator = ta.trend.MACD(close)
                        indicators['MACD'] = float(macd_indicator.macd().iloc[-1])
                        indicators['MACD_Signal'] = float(macd_indicator.macd_signal().iloc[-1])
                        indicators['MACD_Histogram'] = float(macd_indicator.macd_diff().iloc[-1])

                    elif indicator == 'Bollinger' and len(close) >= 20:
                        bb_indicator = ta.volatility.BollingerBands(close, window=20, window_dev=2)
                        indicators['BB_Upper'] = float(bb_indicator.bollinger_hband().iloc[-1])
                        indicators['BB_Middle'] = float(bb_indicator.bollinger_mavg().iloc[-1])
                        indicators['BB_Lower'] = float(bb_indicator.bollinger_lband().iloc[-1])

                    elif indicator == 'Stochastic' and len(close) >= 14:
                        stoch_indicator = ta.momentum.StochasticOscillator(high, low, close, window=14, smooth_window=3)
                        indicators['Stoch_K'] = float(stoch_indicator.stoch().iloc[-1])
                        indicators['Stoch_D'] = float(stoch_indicator.stoch_signal().iloc[-1])

                    elif indicator == 'ADX' and len(close) >= 14:
                        adx_indicator = ta.trend.ADXIndicator(high, low, close, window=14)
                        indicators['ADX'] = float(adx_indicator.adx().iloc[-1])
                        indicators['ADX_Positive'] = float(adx_indicator.adx_pos().iloc[-1])
                        indicators['ADX_Negative'] = float(adx_indicator.adx_neg().iloc[-1])

                    elif indicator == 'ATR' and len(close) >= 14:
                        atr_indicator = ta.volatility.AverageTrueRange(high, low, close, window=14)
                        indicators['ATR'] = float(atr_indicator.average_true_range().iloc[-1])

                    elif indicator == 'VWAP' and len(close) >= 1:
                        vwap_indicator = ta.volume.VolumeSMAIndicator(close, volume, window=len(close))
                        # Alternative VWAP calculation using ta library approach
                        typical_price = (high + low + close) / 3
                        vwap = (typical_price * volume).cumsum() / volume.cumsum()
                        indicators['VWAP'] = float(vwap.iloc[-1])

                    elif indicator == 'OBV' and len(close) >= 1:
                        obv_indicator = ta.volume.OnBalanceVolumeIndicator(close, volume)
                        indicators['OBV'] = float(obv_indicator.on_balance_volume().iloc[-1])

                    elif indicator == 'Williams_R' and len(close) >= 14:
                        williams_r = ta.momentum.WilliamsRIndicator(high, low, close, lbp=14)
                        indicators['Williams_R'] = float(williams_r.williams_r().iloc[-1])

                    elif indicator == 'CCI' and len(close) >= 20:
                        cci_indicator = ta.trend.CCIIndicator(high, low, close, window=20)
                        indicators['CCI'] = float(cci_indicator.cci().iloc[-1])

                    elif indicator == 'ROC' and len(close) >= 10:
                        roc_indicator = ta.momentum.ROCIndicator(close, window=10)
                        indicators['ROC'] = float(roc_indicator.roc().iloc[-1])

                except Exception as e:
                    print(f"Error calculating {indicator} with ta library: {e}")
                    continue

        except Exception as e:
            print(f"Error in indicator calculation: {e}")

        return indicators

    @staticmethod
    def _calculate_basic_indicators(df: pd.DataFrame, indicator_types: List[str]) -> Dict[str, float]:
        """Fallback basic indicator calculations when ta library is not available"""
        indicators = {}

        try:
            close = df['close'] if 'close' in df.columns else df['Close']
            high = df['high'] if 'high' in df.columns else df['High']
            low = df['low'] if 'low' in df.columns else df['Low']
            volume = df['volume'] if 'volume' in df.columns else df['Volume']

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
                        gain = delta.where(delta > 0, 0)
                        loss = -delta.where(delta < 0, 0)
                        avg_gain = gain.ewm(alpha=1/14, adjust=False).mean()
                        avg_loss = loss.ewm(alpha=1/14, adjust=False).mean()
                        rs = avg_gain / avg_loss
                        rsi = 100 - (100 / (1 + rs))
                        indicators['RSI'] = float(rsi.iloc[-1])

                except Exception as e:
                    print(f"Error calculating basic {indicator}: {e}")
                    continue

        except Exception as e:
            print(f"Error in basic indicator calculation: {e}")

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
            'SP500': 'https://cn.tradingview.com/symbols/SP500/?exchange=VANTAGE',
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
            # Set end date to tomorrow to include latest data
            end_date = datetime.now() + timedelta(days=1)
            hist = ticker.history(period="2d", end=end_date)

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
            # Set end date to tomorrow to include latest data
            end_date = datetime.now() + timedelta(days=1)

            # Determine required data period for indicators
            required_period = self._get_extended_period_for_indicators("3mo", indicator_types)
            df = ticker.history(period=required_period, end=end_date)

            if len(df) > 0:
                print(f"Using {len(df)} data points for indicator calculation (period: {required_period})")
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
                # Set end date to tomorrow to include latest data
                end_date = datetime.now() + timedelta(days=1)
                df = ticker.history(period=period, interval=interval, end=end_date)

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
                    # For technical indicators, we need more data than just the requested period
                    # Get extended period for indicator calculations
                    extended_period = self._get_extended_period_for_indicators(period, indicator_types)
                    if extended_period != period:
                        print(f"Getting extended data ({extended_period}) for indicator calculation...")
                        extended_df = ticker.history(period=extended_period, interval=interval, end=end_date)
                        if len(extended_df) > len(df):
                            df_for_indicators = extended_df
                        else:
                            df_for_indicators = df
                    else:
                        df_for_indicators = df

                    indicators = self.ti.calculate_all_indicators(df_for_indicators, indicator_types)
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

    def _get_extended_period_for_indicators(self, requested_period: str, indicator_types: List[str]) -> str:
        """Get extended period needed for technical indicator calculations"""
        # Map requested periods to minimum data points needed
        period_to_days = {
            '1d': 1, '5d': 5, '1mo': 30, '3mo': 90, '6mo': 180,
            '1y': 365, '2y': 730, '5y': 1825, '10y': 3650, 'max': 7300
        }

        # Check what indicators need more data
        needs_extended = False
        min_days_needed = 30  # Default minimum

        for indicator in indicator_types:
            if indicator in ['MACD']:
                min_days_needed = max(min_days_needed, 60)  # Need ~2 months for MACD
                needs_extended = True
            elif indicator in ['SMA', 'EMA'] and '50' in str(indicator):
                min_days_needed = max(min_days_needed, 75)  # Need ~2.5 months for SMA/EMA 50
                needs_extended = True
            elif indicator in ['ADX', 'ATR', 'RSI', 'Stochastic']:
                min_days_needed = max(min_days_needed, 45)  # Need ~1.5 months
                needs_extended = True

        if not needs_extended:
            return requested_period

        # Get current period days
        current_days = period_to_days.get(requested_period, 30)

        # If current period is sufficient, use it
        if current_days >= min_days_needed:
            return requested_period

        # Otherwise, find the next suitable period
        suitable_periods = ['3mo', '6mo', '1y', '2y']
        for period in suitable_periods:
            if period_to_days[period] >= min_days_needed:
                print(f"Extended period {period} selected for indicators (need {min_days_needed} days)")
                return period

        return '6mo'  # Default fallback

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
                        # Set end date to tomorrow to include latest data
                        end_date = datetime.now() + timedelta(days=1)
                        hist = ticker.history(period="2d", end=end_date)

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
                # Set end date to tomorrow to include latest data
                end_date = datetime.now() + timedelta(days=1)
                df = ticker.history(period=f"{timeframe}d", end=end_date)

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

class FinancialAnalyzer:
    """Advanced financial analysis functions"""

    def __init__(self, market_api: MarketDataAPI):
        self.api = market_api

    def fetch_price_data(self, symbols: list[str], period: str = '1y') -> pd.DataFrame:
        """Fetch historical price data for analysis"""
        bars = self.api.get_historical_data(symbols, '1d', period)

        df_list = []
        for bar in bars:
            if not bar.get('error'):
                df_list.append({
                    'symbol': bar['symbol'],
                    'date': pd.to_datetime(bar['datetime']),
                    'close': bar['close']
                })

        if not df_list:
            return pd.DataFrame()

        df = pd.DataFrame(df_list)
        df_pivot = df.pivot(index='date', columns='symbol', values='close')
        return df_pivot

    def calculate_rolling_stats(self, symbols: list[str], window: int, stat_type: str) -> dict:
        """Calculate rolling statistics"""
        if not YFINANCE_AVAILABLE:
            return {'error': 'yfinance required for rolling stats'}

        df = self.fetch_price_data(symbols, period='2y')

        if df.empty:
            return {'error': 'No data available for symbols'}

        results = {}

        for symbol in df.columns:
            prices = df[symbol].dropna()

            if stat_type == 'mean':
                rolling = prices.rolling(window=window).mean()
            elif stat_type == 'std':
                rolling = prices.rolling(window=window).std()
            elif stat_type == 'var':
                rolling = prices.rolling(window=window).var()
            elif stat_type == 'corr':
                if len(df.columns) > 1:
                    other_cols = [c for c in df.columns if c != symbol]
                    rolling = prices.rolling(window=window).corr(df[other_cols[0]])
                else:
                    rolling = pd.Series([np.nan] * len(prices))
            else:
                rolling = prices.rolling(window=window).mean()

            results[symbol] = rolling.dropna().tolist()

        return {
            'rolling_stats': results,
            'window': window,
            'stat_type': stat_type,
            'symbols': list(df.columns)
        }

    def calculate_correlation_matrix(self, symbols: list[str]) -> dict:
        """Calculate correlation matrix for multiple assets"""
        df = self.fetch_price_data(symbols, period='1y')

        if df.empty or len(df.columns) < 2:
            return {'error': 'Need at least 2 symbols with data'}

        returns = df.pct_change().dropna()
        corr_matrix = returns.corr()

        return {
            'correlation_matrix': corr_matrix.values.tolist(),
            'symbols': corr_matrix.columns.tolist()
        }

    def regression_analysis(self, symbol: str, benchmark: str, factors: list[str]) -> dict:
        """Perform regression analysis (CAPM or multi-factor)"""
        if not STATSMODELS_AVAILABLE:
            return {'error': 'statsmodels required for regression'}

        all_symbols = [symbol, benchmark] + (factors if factors else [])
        df = self.fetch_price_data(all_symbols, period='2y')

        if df.empty or symbol not in df.columns or benchmark not in df.columns:
            return {'error': 'Insufficient data for regression'}

        returns = df.pct_change().dropna()

        y = returns[symbol]
        X = returns[[benchmark] + factors] if factors else returns[[benchmark]]
        X = sm.add_constant(X)

        model = OLS(y, X).fit()

        return {
            'alpha': float(model.params[0]),
            'beta': model.params[1:].tolist() if len(model.params) > 2 else float(model.params[1]),
            'r_squared': float(model.rsquared),
            'p_values': model.pvalues.tolist(),
            'residuals': model.resid.tolist()
        }

    def var_analysis(self, symbols: list[str], confidence: float, method: str) -> dict:
        """Calculate Value at Risk (VaR) and CVaR"""
        if not SCIPY_AVAILABLE:
            return {'error': 'scipy required for VaR calculation'}

        df = self.fetch_price_data(symbols, period='1y')

        if df.empty:
            return {'error': 'No data available'}

        returns = df.pct_change().dropna()
        portfolio_returns = returns.mean(axis=1)

        if method == 'historical':
            var = np.percentile(portfolio_returns, (1 - confidence) * 100)
            cvar = portfolio_returns[portfolio_returns <= var].mean()
        elif method == 'parametric':
            mean = portfolio_returns.mean()
            std = portfolio_returns.std()
            var = stats.norm.ppf(1 - confidence, mean, std)
            cvar = mean - std * stats.norm.pdf(stats.norm.ppf(1 - confidence)) / (1 - confidence)
        else:
            var = np.percentile(portfolio_returns, (1 - confidence) * 100)
            cvar = portfolio_returns[portfolio_returns <= var].mean()

        return {
            'var': float(var),
            'cvar': float(cvar),
            'method': method,
            'confidence': confidence
        }

    def portfolio_optimization(self, symbols: list[str], target_return: float, risk_free_rate: float) -> dict:
        """Optimize portfolio weights using scipy (simplified Markowitz)"""
        if not SCIPY_AVAILABLE:
            return {'error': 'scipy required for portfolio optimization'}

        df = self.fetch_price_data(symbols, period='2y')

        if df.empty or len(df.columns) < 2:
            return {'error': 'Need at least 2 symbols with data'}

        returns = df.pct_change().dropna()
        mean_returns = returns.mean().values
        cov_matrix = returns.cov().values

        n_assets = len(symbols)

        # Simple equal-weighted portfolio as baseline
        equal_weights = np.ones(n_assets) / n_assets
        equal_return = float(mean_returns @ equal_weights)
        equal_volatility = float(np.sqrt(equal_weights @ cov_matrix @ equal_weights))
        equal_sharpe = (equal_return - risk_free_rate) / equal_volatility if equal_volatility > 0 else 0

        # Use scipy minimize for minimum variance portfolio
        from scipy.optimize import minimize

        def portfolio_volatility(weights):
            return np.sqrt(weights @ cov_matrix @ weights)

        constraints = [
            {'type': 'eq', 'fun': lambda w: np.sum(w) - 1},  # weights sum to 1
        ]
        bounds = tuple((0, 1) for _ in range(n_assets))
        initial_weights = equal_weights

        result = minimize(
            portfolio_volatility,
            initial_weights,
            method='SLSQP',
            bounds=bounds,
            constraints=constraints
        )

        if not result.success:
            return {
                'error': 'Optimization failed, returning equal-weighted portfolio',
                'weights': equal_weights.tolist(),
                'expected_return': equal_return,
                'volatility': equal_volatility,
                'sharpe_ratio': equal_sharpe,
                'symbols': symbols
            }

        opt_weights = result.x
        opt_return = float(mean_returns @ opt_weights)
        opt_volatility = float(np.sqrt(opt_weights @ cov_matrix @ opt_weights))
        opt_sharpe = (opt_return - risk_free_rate) / opt_volatility if opt_volatility > 0 else 0

        return {
            'weights': opt_weights.tolist(),
            'expected_return': opt_return,
            'volatility': opt_volatility,
            'sharpe_ratio': opt_sharpe,
            'symbols': symbols,
            'note': 'Minimum variance portfolio (scipy optimization)'
        }

    def garch_model(self, symbol: str, p: int, q: int, forecast_periods: int) -> dict:
        """Fit GARCH model for volatility forecasting"""
        if not ARCH_AVAILABLE:
            return {'error': 'arch library required for GARCH modeling'}

        df = self.fetch_price_data([symbol], period='2y')

        if df.empty or symbol not in df.columns:
            return {'error': 'Insufficient data for GARCH model'}

        returns = df[symbol].pct_change().dropna() * 100

        try:
            model = arch_model(returns, vol='Garch', p=p, q=q)
            fitted = model.fit(disp='off')

            forecast = fitted.forecast(horizon=forecast_periods)
            forecast_variance = forecast.variance.values[-1, :]

            return {
                'omega': float(fitted.params['omega']),
                'alpha': [float(fitted.params[f'alpha[{i+1}]']) for i in range(p)],
                'beta': [float(fitted.params[f'beta[{i+1}]']) for i in range(q)],
                'current_volatility': float(fitted.conditional_volatility[-1]),
                'forecast': forecast_variance.tolist(),
                'aic': float(fitted.aic),
                'bic': float(fitted.bic)
            }
        except Exception as e:
            return {'error': f'GARCH model failed: {str(e)}'}

    def calculate_sharpe_ratio(self, symbols: list[str], risk_free_rate: float) -> dict:
        """Calculate Sharpe ratio for portfolio"""
        df = self.fetch_price_data(symbols, period='1y')

        if df.empty:
            return {'error': 'No data available'}

        returns = df.pct_change().dropna()
        portfolio_returns = returns.mean(axis=1)

        mean_return = portfolio_returns.mean() * 252
        volatility = portfolio_returns.std() * np.sqrt(252)

        sharpe = (mean_return - risk_free_rate) / volatility if volatility > 0 else 0

        return {
            'sharpe_ratio': float(sharpe),
            'annual_return': float(mean_return),
            'annual_volatility': float(volatility),
            'risk_free_rate': risk_free_rate
        }

# Execute operation
api = MarketDataAPI()
analyzer = FinancialAnalyzer(api)
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

    # === Financial Analysis Operations ===
    elif operation == "rolling_stats":
        if not ${symbolsStr} or len(${symbolsStr}) == 0:
            result = {"error": "No symbols provided for rolling stats"}
        else:
            symbols = ${symbolsStr}
            analysis_result = analyzer.calculate_rolling_stats(symbols, ${windowValue}, "${statTypeValue}")
            result = {**analysis_result, "summary": f"Calculated rolling {analysis_result.get('stat_type', 'stats')} for {len(symbols)} symbols"}

    elif operation == "correlation_matrix":
        if not ${symbolsStr} or len(${symbolsStr}) < 2:
            result = {"error": "Need at least 2 symbols for correlation matrix"}
        else:
            symbols = ${symbolsStr}
            analysis_result = analyzer.calculate_correlation_matrix(symbols)
            result = {**analysis_result, "summary": f"Calculated correlation matrix for {len(symbols)} symbols"}

    elif operation == "regression_analysis":
        if not ${symbolsStr} or len(${symbolsStr}) == 0:
            result = {"error": "No symbol provided for regression"}
        elif not "${benchmarkValue}":
            result = {"error": "No benchmark provided for regression"}
        else:
            symbol = ${symbolsStr}[0]
            benchmark = "${benchmarkValue}"
            factors = ${factorsStr}
            analysis_result = analyzer.regression_analysis(symbol, benchmark, factors)
            result = {**analysis_result, "summary": f"Regression analysis: {symbol} vs {benchmark}"}

    elif operation == "var_analysis":
        if not ${symbolsStr} or len(${symbolsStr}) == 0:
            result = {"error": "No symbols provided for VaR analysis"}
        else:
            symbols = ${symbolsStr}
            analysis_result = analyzer.var_analysis(symbols, ${confidenceLevelValue}, "${varMethodValue}")
            result = {**analysis_result, "summary": f"VaR analysis at {analysis_result.get('confidence', 0.95)*100}% confidence"}

    elif operation == "portfolio_optimization":
        if not ${symbolsStr} or len(${symbolsStr}) < 2:
            result = {"error": "Need at least 2 symbols for portfolio optimization"}
        else:
            symbols = ${symbolsStr}
            analysis_result = analyzer.portfolio_optimization(symbols, ${targetReturnValue}, ${riskFreeRateValue})
            result = {**analysis_result, "summary": f"Optimized portfolio for {len(symbols)} assets"}

    elif operation == "garch_model":
        if not ${symbolsStr} or len(${symbolsStr}) == 0:
            result = {"error": "No symbol provided for GARCH model"}
        else:
            symbol = ${symbolsStr}[0]
            analysis_result = analyzer.garch_model(symbol, ${garchPValue}, ${garchQValue}, ${forecastPeriodsValue})
            result = {**analysis_result, "summary": f"GARCH({${garchPValue}},{${garchQValue}}) model for {symbol}"}

    elif operation == "sharpe_ratio":
        if not ${symbolsStr} or len(${symbolsStr}) == 0:
            result = {"error": "No symbols provided for Sharpe ratio"}
        else:
            symbols = ${symbolsStr}
            analysis_result = analyzer.calculate_sharpe_ratio(symbols, ${riskFreeRateValue})
            result = {**analysis_result, "summary": f"Sharpe ratio for portfolio of {len(symbols)} assets"}

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
    "scipy_available": SCIPY_AVAILABLE,
    "statsmodels_available": STATSMODELS_AVAILABLE,
    "arch_available": ARCH_AVAILABLE,
    "timestamp": datetime.now().isoformat()
}

print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
`;
  }

  protected parseResult(pythonOutput: string, params: FinancialAnalyzerParams): FinancialAnalyzerResult {
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
              rolling_stats, correlation_matrix, alpha, beta, r_squared, p_values,
              var: varValue, cvar, method, confidence, weights, expected_return, volatility,
              sharpe_ratio, omega, forecast, aic, bic, annual_return, annual_volatility,
              risk_free_rate, symbols, window, stat_type, current_volatility, note,
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

      // === Format Statistical Analysis Results ===

      // Rolling Statistics
      if (rolling_stats) {
        displayContent += '### 📊 Rolling Statistics\n\n';
        displayContent += `**Window**: ${window} days | **Statistic**: ${stat_type}\n\n`;

        Object.entries(rolling_stats).forEach(([symbol, values]) => {
          if (Array.isArray(values) && values.length > 0) {
            const recent = (values as number[]).slice(-5);
            displayContent += `**${symbol}**: ${recent.map(v => v.toFixed(4)).join(', ')} (last 5 values)\n`;
          }
        });
        displayContent += '\n';
      }

      // Correlation Matrix
      if (correlation_matrix) {
        displayContent += '### 📊 Correlation Matrix\n\n';
        if (symbols && Array.isArray(symbols)) {
          displayContent += '| Symbol | ' + symbols.join(' | ') + ' |\n';
          displayContent += '|--------|' + symbols.map(() => '--------').join('|') + '|\n';

          correlation_matrix.forEach((row: number[], i: number) => {
            displayContent += `| **${symbols[i]}** | ${row.map(v => v.toFixed(3)).join(' | ')} |\n`;
          });
        } else {
          displayContent += `\`\`\`\n${JSON.stringify(correlation_matrix, null, 2)}\n\`\`\`\n`;
        }
        displayContent += '\n';
      }

      // Regression Analysis (CAPM)
      if (alpha !== undefined && beta !== undefined) {
        displayContent += '### 📈 Regression Analysis (CAPM)\n\n';
        displayContent += `**Alpha**: ${alpha.toFixed(6)}\n`;
        displayContent += `**Beta**: ${Array.isArray(beta) ? beta.map(b => b.toFixed(4)).join(', ') : beta.toFixed(4)}\n`;
        if (r_squared !== undefined) displayContent += `**R²**: ${r_squared.toFixed(4)}\n`;
        if (p_values && Array.isArray(p_values)) {
          displayContent += `**P-values**: ${p_values.map(p => p.toFixed(6)).join(', ')}\n`;
        }
        displayContent += '\n';
      }

      // VaR Analysis
      if (varValue !== undefined) {
        displayContent += '### ⚠️ Value at Risk (VaR)\n\n';
        displayContent += `**VaR (${(confidence || 0.95) * 100}% confidence)**: ${varValue.toFixed(6)}\n`;
        if (cvar !== undefined) displayContent += `**CVaR (Expected Shortfall)**: ${cvar.toFixed(6)}\n`;
        displayContent += `**Method**: ${method || 'historical'}\n\n`;
      }

      // Portfolio Optimization
      if (weights && Array.isArray(weights)) {
        displayContent += '### 💼 Portfolio Optimization\n\n';
        if (symbols && Array.isArray(symbols)) {
          displayContent += '**Optimal Weights**:\n';
          symbols.forEach((sym: string, i: number) => {
            displayContent += `- ${sym}: ${(weights[i] * 100).toFixed(2)}%\n`;
          });
        }
        if (expected_return !== undefined) displayContent += `\n**Expected Return**: ${(expected_return * 100).toFixed(2)}%\n`;
        if (volatility !== undefined) displayContent += `**Volatility**: ${(volatility * 100).toFixed(2)}%\n`;
        if (sharpe_ratio !== undefined) displayContent += `**Sharpe Ratio**: ${sharpe_ratio.toFixed(4)}\n`;
        if (note) displayContent += `\n*${note}*\n`;
        displayContent += '\n';
      }

      // GARCH Model
      if (omega !== undefined) {
        displayContent += '### 📉 GARCH Model Results\n\n';
        displayContent += `**Omega**: ${omega.toFixed(6)}\n`;
        if (current_volatility !== undefined) displayContent += `**Current Volatility**: ${current_volatility.toFixed(4)}\n`;
        if (forecast && Array.isArray(forecast)) {
          displayContent += `**Volatility Forecast**: ${forecast.map(v => v.toFixed(4)).join(', ')}\n`;
        }
        if (aic !== undefined) displayContent += `**AIC**: ${aic.toFixed(2)}\n`;
        if (bic !== undefined) displayContent += `**BIC**: ${bic.toFixed(2)}\n`;
        displayContent += '\n';
      }

      // Sharpe Ratio (standalone)
      if (sharpe_ratio !== undefined && !weights) {
        displayContent += '### 📊 Sharpe Ratio\n\n';
        displayContent += `**Sharpe Ratio**: ${sharpe_ratio.toFixed(4)}\n`;
        if (annual_return !== undefined) displayContent += `**Annual Return**: ${(annual_return * 100).toFixed(2)}%\n`;
        if (annual_volatility !== undefined) displayContent += `**Annual Volatility**: ${(annual_volatility * 100).toFixed(2)}%\n`;
        if (risk_free_rate !== undefined) displayContent += `**Risk-Free Rate**: ${(risk_free_rate * 100).toFixed(2)}%\n`;
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


      // displayContent += '\n*🚀 **Powered by**: tvscreener (real-time screening) + yfinance (historical data & indicators)*\n';

      // Generate visualizations for frontend
      const visualizations: VisualizationData[] = [];

      // Convert quotes to visualization
      if (quotes && quotes.length > 0) {
        const validQuotes = quotes.filter((q: QuoteData) => !('error' in q));
        if (validQuotes.length > 0) {
          visualizations.push({
            type: 'quotes',
            title: 'Market Quotes',
            data: validQuotes.map((q: QuoteData) => ({
              symbol: q.symbol,
              price: q.price,
              change: q.change,
              change_percent: q.change_percent,
              volume: q.volume,
              market_cap: q.market_cap || 0,
              pe_ratio: q.pe_ratio || 0,
              source: q.source || 'unknown'
            })),
            metadata: {
              symbols: validQuotes.map((q: QuoteData) => q.symbol),
              source: 'market_data_tool'
            }
          });
        }
      }

      // Convert historical bars to visualization
      if (bars && bars.length > 0) {
        const validBars = bars.filter((b: HistoricalBar) => !('error' in b));
        if (validBars.length > 0) {
          // Group bars by symbol for OHLC visualization
          visualizations.push({
            type: 'ohlc_bars',
            title: 'Historical OHLC Data',
            data: validBars.map((b: HistoricalBar) => ({
              symbol: b.symbol,
              datetime: b.datetime,
              open: b.open,
              high: b.high,
              low: b.low,
              close: b.close,
              volume: b.volume,
              source: b.source || 'yfinance'
            })),
            metadata: {
              symbols: [...new Set(validBars.map((b: HistoricalBar) => b.symbol))].map(String),
              timeframe: params.period || '1d',
              source: 'yfinance'
            }
          });

          // Extract technical indicators from bars if present
          const barsWithIndicators = validBars.filter((b: HistoricalBar) => b.indicators && Object.keys(b.indicators).length > 0);
          if (barsWithIndicators.length > 0) {
            const indicatorData: Array<Record<string, string | number | boolean>> = [];

            barsWithIndicators.forEach((bar: HistoricalBar) => {
              if (bar.indicators) {
                Object.entries(bar.indicators).forEach(([indicator, value]) => {
                  indicatorData.push({
                    date: bar.datetime,
                    indicator,
                    value,
                    symbol: bar.symbol
                  });
                });
              }
            });

            if (indicatorData.length > 0) {
              visualizations.push({
                type: 'technical_indicators',
                title: 'Technical Indicators',
                data: indicatorData,
                metadata: {
                  symbols: [...new Set(barsWithIndicators.map((b: HistoricalBar) => b.symbol))].map(String),
                  indicators: [...new Set(indicatorData.map(d => String(d['indicator'])))],
                  source: 'calculated'
                }
              });
            }
          }
        }
      }

      // Convert screener results to visualization
      if (screener_results && screener_results.length > 0) {
        visualizations.push({
          type: 'screener_results',
          title: 'Stock Screener Results',
          data: screener_results.map((r: ScreenerResult) => ({
            symbol: r.symbol,
            description: r.name,
            price: r.price,
            change_percent: r.change_percent,
            volume: r.volume,
            market_cap: r.market_cap,
            sector: r.sector || 'Unknown',
            pe_ratio: r.pe_ratio || 0,
            market: r.market || 'stocks'
          })),
          metadata: {
            symbols: screener_results.map((r: ScreenerResult) => r.symbol),
            source: 'tvscreener'
          }
        });
      }

      // Convert standalone technical indicators to visualization
      if (technical_indicators && technical_indicators.length > 0) {
        const indicatorData = technical_indicators.map((ti: TechnicalIndicator) => ({
          date: new Date().toISOString(),
          indicator: ti.indicator_name,
          value: ti.value,
          symbol: ti.symbol,
          signal: ti.signal || 'NEUTRAL',
          timeframe: ti.timeframe
        }));

        // Check if we already have technical indicators visualization from bars
        const hasIndicatorsFromBars = visualizations.some(v => v.type === 'technical_indicators');

        if (!hasIndicatorsFromBars) {
          visualizations.push({
            type: 'technical_indicators',
            title: 'Technical Analysis',
            data: indicatorData,
            metadata: {
              symbols: [...new Set(technical_indicators.map((ti: TechnicalIndicator) => ti.symbol))].map(String),
              indicators: [...new Set(technical_indicators.map((ti: TechnicalIndicator) => ti.indicator_name))].map(String),
              timeframe: technical_indicators[0]?.timeframe || '30d'
            }
          });
        }
      }

      // Convert index data to visualization (can be treated as quotes)
      if (indices && indices.length > 0) {
        visualizations.push({
          type: 'quotes',
          title: 'Major Indices',
          data: indices.map((idx: IndexData) => ({
            symbol: idx.symbol,
            name: idx.name,
            price: idx.price,
            change: idx.change,
            change_percent: idx.change_percent,
            volume: idx.volume,
            open: idx.open,
            high: idx.high,
            low: idx.low,
            source: idx.source || 'mixed'
          })),
          metadata: {
            symbols: indices.map((idx: IndexData) => idx.symbol),
            source: 'market_data_tool'
          }
        });
      }

      // Handle special operations (n225, sp500, nasdaq, usdjpy)
      const specialData = n225_data || sp500_data || nasdaq_data || usdjpy_data;
      if (specialData) {
        const dataKey = Object.keys(specialData)[0];
        const data = specialData[dataKey];

        if (data && !data.error) {
          // Add futures/spot data as quotes
          const quoteData: Array<Record<string, string | number | boolean>> = [];

          if (data.futures && !data.futures.error) {
            quoteData.push({
              symbol: `${data.symbol} (Futures)`,
              price: data.futures.current_price || data.futures.price || 0,
              change: data.futures.change || 0,
              change_percent: data.futures.change_percent || 0,
              volume: data.futures.volume || 0,
              source: 'tradingview_futures'
            });
          }

          if (data.spot && !data.spot.error) {
            quoteData.push({
              symbol: `${data.symbol} (Spot)`,
              price: data.spot.current_price || data.spot.price || 0,
              change: data.spot.change || 0,
              change_percent: data.spot.change_percent || 0,
              volume: data.spot.volume || 0,
              source: 'yfinance_spot'
            });
          }

          if (data.forex && !data.forex.error) {
            quoteData.push({
              symbol: data.symbol,
              price: data.forex.current_price || data.forex.price || 0,
              change: data.forex.change || 0,
              change_percent: data.forex.change_percent || 0,
              volume: data.forex.volume || 0,
              source: 'forex'
            });
          }

          if (quoteData.length > 0) {
            visualizations.push({
              type: 'quotes',
              title: data.name || data.symbol,
              data: quoteData,
              metadata: {
                symbols: [data.symbol],
                source: 'mixed'
              }
            });
          }
        }
      }

      // Create structured data for frontend
      const structuredData: ToolResponseData = {
        operation: params.op,
        summary,
        visualizations,
        // Include minimal details for debugging if needed
        details: {
          hasQuotes: quotes && quotes.length > 0,
          hasBars: bars && bars.length > 0,
          hasScreenerResults: screener_results && screener_results.length > 0,
          hasIndices: indices && indices.length > 0,
          hasTechnicalIndicators: technical_indicators && technical_indicators.length > 0,
          timestamp: new Date().toISOString()
        }
      };

      return {
        llmContent: displayContent,
        returnDisplay: displayContent,
        structuredData,
      };

    } catch (error) {
      return {
        llmContent: `Failed to parse result: ${error}\n\nRaw output:\n${pythonOutput}`,
        returnDisplay: `❌ Failed to parse result: ${error}`,
      };
    }
  }
}