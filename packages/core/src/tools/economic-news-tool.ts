/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { ToolResult } from './tools.js';
import { BasePythonTool } from './base-python-tool.js';

interface EconomicNewsParams {
  op: 'get_latest_news' | 'get_category_news' | 'get_sentiment_analysis' | 'get_sources';
  category?: 'general' | 'markets' | 'forex' | 'crypto' | 'central_banks' | 'commodities';
  sources?: string[];
  hours_back?: number;
  max_articles?: number;
  sentiment_filter?: 'positive' | 'negative' | 'neutral' | 'all';
  keywords?: string[];
  countries?: string[];
  search_mode?: 'simple' | 'boolean' | 'phrase';
  extract_full_content?: boolean;
  sort_by?: 'date' | 'relevance';
}

interface NewsArticle {
  title: string;
  summary: string;
  published_date: string;
  source: string;
  url: string;
  category: string;
  sentiment?: {
    score: number;
    label: 'positive' | 'negative' | 'neutral';
  };
  keywords?: string[];
  countries?: string[];
  full_content?: string;
  relevance_score?: number;
}

interface EconomicNewsResult extends ToolResult {
  data?: {
    articles: NewsArticle[];
    sources_used: string[];
    category_filter?: string;
    summary: string;
    sentiment_stats?: {
      positive: number;
      negative: number;
      neutral: number;
    };
  };
}

export class EconomicNewsTool extends BasePythonTool<EconomicNewsParams, EconomicNewsResult> {
  static readonly Name: string = 'economic_news_tool';
  constructor(config: Config) {
    super(
      'economic_news_tool',
      'Economic News Aggregator',
      'Aggregate financial news from multiple RSS sources with sentiment analysis and categorization',
      ['feedparser', 'beautifulsoup4', 'textblob', 'requests', 'trafilatura'],
      {
        type: 'object',
        properties: {
          op: {
            type: 'string',
            enum: ['get_latest_news', 'get_category_news', 'get_sentiment_analysis', 'get_sources'],
            description: 'Operation: get_latest_news (latest from all sources), get_category_news (filter by category), get_sentiment_analysis (with sentiment scoring), get_sources (list available sources)',
          },
          category: {
            type: 'string',
            enum: ['general', 'markets', 'forex', 'crypto', 'central_banks', 'commodities'],
            description: 'News category filter: general (broad financial), markets (stocks/trading), forex (currencies), crypto (digital assets), central_banks (monetary policy), commodities (oil/gold/etc)',
          },
          sources: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific RSS sources to use (if not specified, uses category-appropriate sources)',
          },
          hours_back: {
            type: 'number',
            description: 'How many hours back to look for news (default: 24)',
            minimum: 1,
            maximum: 168,
          },
          max_articles: {
            type: 'number',
            description: 'Maximum number of articles to return (default: 50)',
            minimum: 1,
            maximum: 200,
          },
          sentiment_filter: {
            type: 'string',
            enum: ['positive', 'negative', 'neutral', 'all'],
            description: 'Filter articles by sentiment (default: all)',
          },
          keywords: {
            type: 'array',
            items: { type: 'string' },
            description: 'Keywords to filter articles by (case-insensitive)',
          },
          countries: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by countries/regions (e.g., ["japan", "usa", "europe"])',
          },
          search_mode: {
            type: 'string',
            enum: ['simple', 'boolean', 'phrase'],
            description: 'Search mode: simple (any keyword), boolean (AND/OR logic), phrase (exact phrase)',
          },
          extract_full_content: {
            type: 'boolean',
            description: 'Extract full article content from URL (slower but more comprehensive)',
          },
          sort_by: {
            type: 'string',
            enum: ['date', 'relevance'],
            description: 'Sort results by: date (newest first) or relevance (best match first)',
          },
        },
        required: ['op'],
      },
      config,
      true,
      false,
    );
  }

  protected override requiresConfirmation(_params: EconomicNewsParams): boolean {
    // Economic news tool only reads news data, no confirmation needed
    return false;
  }

  protected generatePythonCode(params: EconomicNewsParams): string {
    const { op, category, sources, hours_back, max_articles, sentiment_filter, keywords, countries, search_mode, extract_full_content, sort_by } = params;

    const categoryValue = category || 'general';
    const sourcesStr = sources ? JSON.stringify(sources) : '[]';
    const hoursValue = hours_back || 24;
    const maxArticlesValue = max_articles || 50;
    const sentimentValue = sentiment_filter || 'all';
    const keywordsStr = keywords ? JSON.stringify(keywords) : '[]';
    const countriesStr = countries ? JSON.stringify(countries) : '[]';
    const searchModeValue = search_mode || 'simple';
    const extractFullContentValue = extract_full_content ? 'True' : 'False';
    const sortByValue = sort_by || 'date';

    return `
import feedparser
import requests
import json
import re
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any
from dataclasses import dataclass, asdict
from bs4 import BeautifulSoup
import warnings
warnings.filterwarnings('ignore')

# Import TextBlob for sentiment analysis
try:
    from textblob import TextBlob
    TEXTBLOB_AVAILABLE = True
except ImportError:
    print("Warning: TextBlob not available. Sentiment analysis will be disabled.")
    TEXTBLOB_AVAILABLE = False

# Try to import trafilatura for full content extraction
try:
    import trafilatura
    TRAFILATURA_AVAILABLE = True
except ImportError:
    print("Warning: trafilatura not available. Full content extraction will be limited.")
    TRAFILATURA_AVAILABLE = False

@dataclass
class NewsArticle:
    """News article data model"""
    title: str
    summary: str
    published_date: str
    source: str
    url: str
    category: str
    sentiment: Dict[str, Any] = None
    keywords: List[str] = None
    countries: List[str] = None
    full_content: str = None
    relevance_score: float = 0.0

class EconomicNewsAggregator:
    """Economic news aggregator with sentiment analysis"""

    def __init__(self):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive'
        }

        # Tested and verified RSS sources
        self.rss_sources = {
            # General Financial News
            "Yahoo Finance": {
                "url": "https://finance.yahoo.com/news/rssindex",
                "categories": ["general", "markets"]
            },
            "Bloomberg Markets": {
                "url": "https://feeds.bloomberg.com/markets/news.rss",
                "categories": ["general", "markets"]
            },
            "Bloomberg Economics": {
                "url": "https://feeds.bloomberg.com/economics/news.rss",
                "categories": ["general", "central_banks"]
            },
            "Financial Times": {
                "url": "https://www.ft.com/rss/home",
                "categories": ["general", "markets"]
            },

            # Market-Specific
            "CNBC Top News": {
                "url": "https://www.cnbc.com/id/100003114/device/rss/rss.html",
                "categories": ["general", "markets"]
            },
            "CNBC US Markets": {
                "url": "https://www.cnbc.com/id/10000664/device/rss/rss.html",
                "categories": ["markets"]
            },
            "CNBC World Markets": {
                "url": "https://www.cnbc.com/id/15839135/device/rss/rss.html",
                "categories": ["markets"]
            },
            "WSJ Markets": {
                "url": "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
                "categories": ["markets"]
            },
            "WSJ US Business": {
                "url": "https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml",
                "categories": ["general", "markets"]
            },
            "MarketWatch Top Stories": {
                "url": "https://feeds.marketwatch.com/marketwatch/topstories/",
                "categories": ["general", "markets"]
            },
            "MarketWatch Market Pulse": {
                "url": "https://feeds.marketwatch.com/marketwatch/marketpulse/",
                "categories": ["markets"]
            },
            "Seeking Alpha Market Currents": {
                "url": "https://seekingalpha.com/market_currents.xml",
                "categories": ["markets"]
            },

            # Forex & Commodities
            "Investing.com News": {
                "url": "https://www.investing.com/rss/news.rss",
                "categories": ["general", "forex", "commodities"]
            },
            "Investing.com Forex": {
                "url": "https://www.investing.com/rss/news_285.rss",
                "categories": ["forex"]
            },
            "Investing.com Commodities": {
                "url": "https://www.investing.com/rss/news_95.rss",
                "categories": ["commodities"]
            },

            # Central Banks
            "Federal Reserve": {
                "url": "https://www.federalreserve.gov/feeds/press_all.xml",
                "categories": ["central_banks"]
            },
            "European Central Bank": {
                "url": "https://www.ecb.europa.eu/rss/press.xml",
                "categories": ["central_banks"]
            },

            # Cryptocurrency
            "CoinDesk": {
                "url": "https://www.coindesk.com/arc/outboundfeeds/rss/",
                "categories": ["crypto"]
            },
            "CryptoNews": {
                "url": "https://cryptonews.com/news/feed/",
                "categories": ["crypto"]
            },
        }

    def get_sources_for_category(self, category: str) -> List[str]:
        """Get RSS sources that match the specified category"""
        matching_sources = []
        for source_name, source_info in self.rss_sources.items():
            if category in source_info["categories"]:
                matching_sources.append(source_name)
        return matching_sources

    def clean_html(self, html_content: str) -> str:
        """Clean HTML content and extract text"""
        if not html_content:
            return ""

        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()
            text = soup.get_text()
            # Clean up whitespace
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text = ' '.join(chunk for chunk in chunks if chunk)
            return text[:500]  # Limit length
        except Exception as e:
            print(f"Error cleaning HTML: {e}")
            return html_content[:500]

    def analyze_sentiment(self, text: str) -> Dict[str, Any]:
        """Analyze sentiment of text using TextBlob"""
        if not TEXTBLOB_AVAILABLE or not text:
            return {"score": 0.0, "label": "neutral"}

        try:
            blob = TextBlob(text)
            polarity = blob.sentiment.polarity  # Range: -1 (negative) to 1 (positive)

            if polarity > 0.1:
                label = "positive"
            elif polarity < -0.1:
                label = "negative"
            else:
                label = "neutral"

            return {
                "score": round(polarity, 3),
                "label": label
            }
        except Exception as e:
            print(f"Error analyzing sentiment: {e}")
            return {"score": 0.0, "label": "neutral"}

    def extract_keywords(self, text: str) -> List[str]:
        """Extract key financial terms and keywords from text"""
        if not text:
            return []

        # Common financial keywords to look for
        financial_keywords = [
            # Market terms
            'stock', 'market', 'trading', 'investor', 'investment', 'portfolio',
            'equity', 'bond', 'derivative', 'futures', 'options', 'etf',

            # Economic indicators
            'gdp', 'inflation', 'cpi', 'unemployment', 'employment', 'pmi',
            'retail sales', 'housing', 'manufacturing', 'consumer confidence',

            # Central bank terms
            'federal reserve', 'fed', 'interest rate', 'monetary policy', 'ecb',
            'bank of japan', 'quantitative easing', 'tapering',

            # Currency and forex
            'dollar', 'euro', 'yen', 'pound', 'currency', 'forex', 'exchange rate',

            # Commodities
            'oil', 'gold', 'silver', 'copper', 'wheat', 'corn', 'natural gas',

            # Crypto
            'bitcoin', 'ethereum', 'cryptocurrency', 'blockchain', 'defi',

            # Companies and sectors
            'earnings', 'revenue', 'profit', 'dividend', 'ipo', 'merger',
            'technology', 'healthcare', 'financial', 'energy', 'utilities'
        ]

        text_lower = text.lower()
        found_keywords = []

        for keyword in financial_keywords:
            if keyword in text_lower:
                found_keywords.append(keyword)

        return found_keywords[:10]  # Limit to top 10 keywords

    def extract_countries(self, text: str) -> List[str]:
        """Extract country/region mentions from text"""
        if not text:
            return []

        # Comprehensive country and region mapping
        country_keywords = {
            # Major economies
            'united states': ['usa', 'us', 'united states', 'america', 'american', 'fed', 'federal reserve'],
            'china': ['china', 'chinese', 'beijing', 'pboc', 'yuan', 'renminbi'],
            'japan': ['japan', 'japanese', 'tokyo', 'bank of japan', 'boj', 'yen', 'nikkei'],
            'germany': ['germany', 'german', 'berlin', 'bundesbank', 'euro', 'dax'],
            'united kingdom': ['uk', 'britain', 'british', 'england', 'london', 'bank of england', 'pound', 'sterling', 'ftse'],
            'france': ['france', 'french', 'paris', 'cac'],
            'italy': ['italy', 'italian', 'rome', 'milan'],
            'canada': ['canada', 'canadian', 'toronto', 'bank of canada', 'cad'],
            'australia': ['australia', 'australian', 'sydney', 'rba', 'aud'],
            'south korea': ['south korea', 'korea', 'korean', 'seoul', 'won'],
            'india': ['india', 'indian', 'mumbai', 'delhi', 'rupee', 'rbi', 'sensex'],
            'brazil': ['brazil', 'brazilian', 'sao paulo', 'real', 'bovespa'],
            'russia': ['russia', 'russian', 'moscow', 'ruble', 'rtx'],
            'switzerland': ['switzerland', 'swiss', 'zurich', 'snb', 'franc'],
            'sweden': ['sweden', 'swedish', 'stockholm', 'riksbank', 'krona'],
            'norway': ['norway', 'norwegian', 'oslo', 'krone'],
            'netherlands': ['netherlands', 'dutch', 'amsterdam', 'aex'],
            'spain': ['spain', 'spanish', 'madrid', 'ibex'],
            'mexico': ['mexico', 'mexican', 'peso'],
            'singapore': ['singapore', 'sgd'],
            'hong kong': ['hong kong', 'hk', 'hkd', 'hang seng'],
            'taiwan': ['taiwan', 'taiwanese', 'taiex'],
            'thailand': ['thailand', 'thai', 'baht'],
            'indonesia': ['indonesia', 'indonesian', 'jakarta', 'rupiah'],
            'malaysia': ['malaysia', 'malaysian', 'ringgit'],
            'philippines': ['philippines', 'philippine', 'manila', 'peso'],
            'vietnam': ['vietnam', 'vietnamese', 'dong'],
            'turkey': ['turkey', 'turkish', 'lira'],
            'south africa': ['south africa', 'south african', 'rand'],
            'saudi arabia': ['saudi arabia', 'saudi', 'riyal'],
            'uae': ['uae', 'dubai', 'abu dhabi', 'dirham'],
            'israel': ['israel', 'israeli', 'shekel'],
            'egypt': ['egypt', 'egyptian', 'pound'],
            'argentina': ['argentina', 'argentinian', 'peso'],
            'chile': ['chile', 'chilean', 'peso'],
            'colombia': ['colombia', 'colombian', 'peso'],
            'peru': ['peru', 'peruvian', 'sol'],
            'new zealand': ['new zealand', 'nzd', 'kiwi'],

            # Regions
            'europe': ['europe', 'european', 'eu', 'eurozone', 'ecb', 'european central bank'],
            'asia': ['asia', 'asian', 'asia pacific', 'apac'],
            'middle east': ['middle east', 'gulf'],
            'africa': ['africa', 'african'],
            'latin america': ['latin america', 'south america', 'latam'],
            'north america': ['north america', 'nafta']
        }

        text_lower = text.lower()
        found_countries = []

        for country, keywords in country_keywords.items():
            if any(keyword in text_lower for keyword in keywords):
                found_countries.append(country)

        return found_countries[:5]  # Limit to top 5 countries

    def extract_full_content(self, url: str) -> str:
        """Extract full article content from URL using trafilatura"""
        if not TRAFILATURA_AVAILABLE:
            return ""

        try:
            # Download the webpage
            downloaded = trafilatura.fetch_url(url)
            if downloaded:
                # Extract main text content
                text = trafilatura.extract(downloaded, include_comments=False,
                                         include_tables=False, include_images=False)
                if text:
                    return text[:2000]  # Limit to 2000 characters
            return ""
        except Exception as e:
            print(f"Error extracting content from {url}: {e}")
            return ""

    def advanced_keyword_search(self, text: str, keywords: List[str], search_mode: str = 'simple') -> float:
        """Advanced keyword search with different modes"""
        if not keywords or not text:
            return 0.0

        text_lower = text.lower()

        if search_mode == 'simple':
            # Simple OR search - any keyword matches
            matches = sum(1 for keyword in keywords if keyword.lower() in text_lower)
            return matches / len(keywords)

        elif search_mode == 'phrase':
            # Exact phrase matching
            phrase = ' '.join(keywords).lower()
            return 1.0 if phrase in text_lower else 0.0

        elif search_mode == 'boolean':
            # Boolean logic - support AND/OR
            # For now, implement as AND logic (all keywords must be present)
            matches = sum(1 for keyword in keywords if keyword.lower() in text_lower)
            return 1.0 if matches == len(keywords) else 0.0

        return 0.0

    def calculate_relevance_score(self, article: NewsArticle, keywords: List[str], countries: List[str], search_mode: str) -> float:
        """Calculate relevance score based on multiple factors"""
        score = 0.0

        # Base content for scoring
        full_text = f"{article.title} {article.summary} {article.full_content or ''}"

        # Keyword relevance (40% weight)
        if keywords:
            keyword_score = self.advanced_keyword_search(full_text, keywords, search_mode)
            score += keyword_score * 0.4

        # Country relevance (30% weight)
        if countries:
            country_matches = sum(1 for country in countries if country.lower() in [c.lower() for c in (article.countries or [])])
            country_score = country_matches / len(countries) if countries else 0
            score += country_score * 0.3

        # Source reliability (20% weight) - preference for major sources
        reliable_sources = ['bloomberg', 'reuters', 'wall street journal', 'financial times', 'cnbc']
        source_score = 1.0 if any(source in article.source.lower() for source in reliable_sources) else 0.5
        score += source_score * 0.2

        # Recency (10% weight) - newer articles get higher scores
        try:
            pub_date = datetime.fromisoformat(article.published_date.replace('Z', '+00:00'))
            hours_old = (datetime.now(timezone.utc) - pub_date).total_seconds() / 3600
            recency_score = max(0, 1 - (hours_old / 168))  # Decay over 1 week
            score += recency_score * 0.1
        except:
            score += 0.05  # Default recency score

        return min(1.0, score)

    def fetch_rss_articles(self, source_name: str, source_url: str, hours_back: int = 24) -> List[NewsArticle]:
        """Fetch articles from a single RSS source"""
        articles = []

        try:
            print(f"Fetching from {source_name}: {source_url}")
            response = requests.get(source_url, headers=self.headers, timeout=15)
            response.raise_for_status()

            feed = feedparser.parse(response.content)

            if feed.bozo == 0 or len(feed.entries) > 0:
                cutoff_time = datetime.now(timezone.utc) - timedelta(hours=hours_back)

                for entry in feed.entries:
                    try:
                        # Parse published date
                        if hasattr(entry, 'published_parsed') and entry.published_parsed:
                            pub_date = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
                        else:
                            pub_date = datetime.now(timezone.utc)

                        # Skip old articles
                        if pub_date < cutoff_time:
                            continue

                        # Extract content
                        title = entry.get('title', 'No title')
                        summary = entry.get('summary', entry.get('description', ''))
                        summary = self.clean_html(summary)
                        url = entry.get('link', '')

                        # Determine category
                        source_info = self.rss_sources.get(source_name, {})
                        categories = source_info.get('categories', ['general'])
                        primary_category = categories[0] if categories else 'general'

                        # Analyze sentiment
                        full_text = f"{title} {summary}"
                        sentiment = self.analyze_sentiment(full_text)
                        keywords = self.extract_keywords(full_text)
                        countries = self.extract_countries(full_text)

                        article = NewsArticle(
                            title=title,
                            summary=summary,
                            published_date=pub_date.isoformat(),
                            source=source_name,
                            url=url,
                            category=primary_category,
                            sentiment=sentiment,
                            keywords=keywords,
                            countries=countries,
                            full_content=None,  # Will be populated later if requested
                            relevance_score=0.0  # Will be calculated later
                        )

                        articles.append(article)

                    except Exception as e:
                        print(f"Error parsing article from {source_name}: {e}")
                        continue

            print(f"Retrieved {len(articles)} articles from {source_name}")

        except Exception as e:
            print(f"Error fetching from {source_name}: {e}")

        return articles

    def filter_articles_by_keywords(self, articles: List[NewsArticle], keywords: List[str], search_mode: str = 'simple') -> List[NewsArticle]:
        """Enhanced keyword filtering with different search modes"""
        if not keywords:
            return articles

        filtered_articles = []

        for article in articles:
            text_to_search = f"{article.title} {article.summary} {article.full_content or ''}"
            relevance = self.advanced_keyword_search(text_to_search, keywords, search_mode)

            if relevance > 0:
                article.relevance_score += relevance * 0.5  # Keyword matching contributes to relevance
                filtered_articles.append(article)

        return filtered_articles

    def filter_articles_by_countries(self, articles: List[NewsArticle], countries: List[str]) -> List[NewsArticle]:
        """Filter articles by country/region mentions"""
        if not countries:
            return articles

        filtered_articles = []
        countries_lower = [c.lower() for c in countries]

        for article in articles:
            article_countries = [c.lower() for c in (article.countries or [])]
            if any(country in article_countries for country in countries_lower):
                # Boost relevance for country matches
                matches = sum(1 for country in countries_lower if country in article_countries)
                country_relevance = matches / len(countries)
                article.relevance_score += country_relevance * 0.3
                filtered_articles.append(article)

        return filtered_articles

    def extract_full_content_for_articles(self, articles: List[NewsArticle], max_articles: int = 10) -> List[NewsArticle]:
        """Extract full content for articles (limit to avoid excessive requests)"""
        if not TRAFILATURA_AVAILABLE:
            return articles

        # Only extract full content for top articles to avoid too many requests
        articles_to_process = articles[:max_articles]

        for article in articles_to_process:
            if article.url:
                full_content = self.extract_full_content(article.url)
                if full_content:
                    article.full_content = full_content
                    # Re-analyze with full content
                    full_text = f"{article.title} {article.summary} {full_content}"
                    article.countries = self.extract_countries(full_text)
                    article.keywords = self.extract_keywords(full_text)

        return articles

    def filter_articles_by_sentiment(self, articles: List[NewsArticle], sentiment_filter: str) -> List[NewsArticle]:
        """Filter articles by sentiment"""
        if sentiment_filter == 'all':
            return articles

        filtered_articles = []
        for article in articles:
            if article.sentiment and article.sentiment.get('label') == sentiment_filter:
                filtered_articles.append(article)

        return filtered_articles

    def get_latest_news(self, category: str = 'general', sources: List[str] = None,
                       hours_back: int = 24, max_articles: int = 50,
                       sentiment_filter: str = 'all', keywords: List[str] = None,
                       countries: List[str] = None, search_mode: str = 'simple',
                       extract_full_content: bool = False, sort_by: str = 'date') -> Dict[str, Any]:
        """Get latest news from RSS sources"""

        # Determine which sources to use
        if sources:
            # Use specified sources
            sources_to_use = [s for s in sources if s in self.rss_sources]
        else:
            # Use sources that match the category
            sources_to_use = self.get_sources_for_category(category)

        if not sources_to_use:
            return {
                "articles": [],
                "sources_used": [],
                "summary": f"No RSS sources found for category '{category}'"
            }

        print(f"Using {len(sources_to_use)} sources for category '{category}'")

        all_articles = []
        sources_used = []

        # Fetch from each source
        for source_name in sources_to_use:
            source_url = self.rss_sources[source_name]["url"]
            articles = self.fetch_rss_articles(source_name, source_url, hours_back)

            if articles:
                all_articles.extend(articles)
                sources_used.append(source_name)

        # Extract full content if requested (before filtering for better accuracy)
        if extract_full_content:
            print("Extracting full content for articles...")
            all_articles = self.extract_full_content_for_articles(all_articles, max_articles)

        # Apply filters with enhanced functionality
        if keywords:
            all_articles = self.filter_articles_by_keywords(all_articles, keywords, search_mode)

        if countries:
            all_articles = self.filter_articles_by_countries(all_articles, countries)

        all_articles = self.filter_articles_by_sentiment(all_articles, sentiment_filter)

        # Calculate final relevance scores
        for article in all_articles:
            if keywords or countries:
                relevance = self.calculate_relevance_score(article, keywords or [], countries or [], search_mode)
                article.relevance_score = relevance

        # Sort by requested criteria
        if sort_by == 'relevance' and (keywords or countries):
            all_articles.sort(key=lambda x: x.relevance_score, reverse=True)
        else:
            # Default: sort by published date (newest first)
            all_articles.sort(key=lambda x: x.published_date, reverse=True)

        # Limit results
        all_articles = all_articles[:max_articles]

        # Calculate sentiment statistics
        sentiment_stats = {"positive": 0, "negative": 0, "neutral": 0}
        for article in all_articles:
            if article.sentiment:
                label = article.sentiment.get('label', 'neutral')
                sentiment_stats[label] += 1

        return {
            "articles": [asdict(article) for article in all_articles],
            "sources_used": sources_used,
            "category_filter": category,
            "summary": f"Retrieved {len(all_articles)} articles from {len(sources_used)} sources in last {hours_back} hours",
            "sentiment_stats": sentiment_stats
        }

    def get_available_sources(self) -> Dict[str, Any]:
        """Get list of available RSS sources with their categories"""
        sources_info = {}

        for source_name, source_data in self.rss_sources.items():
            sources_info[source_name] = {
                "url": source_data["url"],
                "categories": source_data["categories"]
            }

        return {
            "sources": sources_info,
            "categories": ["general", "markets", "forex", "crypto", "central_banks", "commodities"],
            "summary": f"Available: {len(sources_info)} RSS sources across 6 categories"
        }

# Execute operation
try:
    aggregator = EconomicNewsAggregator()

    operation = "${op}"

    if operation == "get_latest_news":
        result = aggregator.get_latest_news(
            category="${categoryValue}",
            sources=${sourcesStr} if ${sourcesStr} else None,
            hours_back=${hoursValue},
            max_articles=${maxArticlesValue},
            sentiment_filter="${sentimentValue}",
            keywords=${keywordsStr} if ${keywordsStr} else None,
            countries=${countriesStr} if ${countriesStr} else None,
            search_mode="${searchModeValue}",
            extract_full_content=${extractFullContentValue} == 'True',
            sort_by="${sortByValue}"
        )

    elif operation == "get_category_news":
        result = aggregator.get_latest_news(
            category="${categoryValue}",
            hours_back=${hoursValue},
            max_articles=${maxArticlesValue},
            sentiment_filter="${sentimentValue}",
            keywords=${keywordsStr} if ${keywordsStr} else None,
            countries=${countriesStr} if ${countriesStr} else None,
            search_mode="${searchModeValue}",
            extract_full_content=${extractFullContentValue} == 'True',
            sort_by="${sortByValue}"
        )

    elif operation == "get_sentiment_analysis":
        result = aggregator.get_latest_news(
            category="${categoryValue}",
            sources=${sourcesStr} if ${sourcesStr} else None,
            hours_back=${hoursValue},
            max_articles=${maxArticlesValue},
            sentiment_filter="all",  # Get all for sentiment analysis
            keywords=${keywordsStr} if ${keywordsStr} else None,
            countries=${countriesStr} if ${countriesStr} else None,
            search_mode="${searchModeValue}",
            extract_full_content=${extractFullContentValue} == 'True',
            sort_by="${sortByValue}"
        )

    elif operation == "get_sources":
        result = aggregator.get_available_sources()

    else:
        result = {
            "summary": f"Unknown operation: {operation}",
            "articles": [],
            "sources_used": []
        }

    print("\\n" + "="*50)
    print("ECONOMIC_NEWS_RESULT_START")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print("ECONOMIC_NEWS_RESULT_END")
    print("="*50)

except Exception as e:
    error_result = {
        "error": str(e),
        "articles": [],
        "sources_used": [],
        "summary": f"Error occurred: {str(e)}"
    }
    print("\\n" + "="*50)
    print("ECONOMIC_NEWS_RESULT_START")
    print(json.dumps(error_result, ensure_ascii=False, indent=2))
    print("ECONOMIC_NEWS_RESULT_END")
    print("="*50)
`;
  }

  protected parseResult(pythonOutput: string, params: EconomicNewsParams): EconomicNewsResult {
    try {
      // Extract result from Python output
      const startMarker = 'ECONOMIC_NEWS_RESULT_START';
      const endMarker = 'ECONOMIC_NEWS_RESULT_END';

      const startIndex = pythonOutput.indexOf(startMarker);
      const endIndex = pythonOutput.indexOf(endMarker);

      if (startIndex === -1 || endIndex === -1) {
        return {
          llmContent: 'Economic News Tool: Failed to parse result from Python output',
          returnDisplay: 'Failed to parse result from Python output'
        };
      }

      const resultJson = pythonOutput.substring(
        startIndex + startMarker.length,
        endIndex
      ).trim();

      const result = JSON.parse(resultJson);

      if (result.error) {
        return {
          llmContent: `Economic News Tool Error: ${result.error}`,
          returnDisplay: `Error: ${result.error}`
        };
      }

      // Format success result
      let content = `## ${result.summary}\n\n`;
      let display = `Economic News: ${result.summary}\n\n`;

      // Show sources used
      if (result.sources_used && result.sources_used.length > 0) {
        content += `**Sources**: ${result.sources_used.join(', ')}\n\n`;
        display += `Sources: ${result.sources_used.length}\n`;
      }

      // Show category filter
      if (result.category_filter) {
        content += `**Category**: ${result.category_filter}\n\n`;
      }

      // Show sentiment statistics
      if (result.sentiment_stats) {
        const { positive, negative, neutral } = result.sentiment_stats;
        const total = positive + negative + neutral;
        if (total > 0) {
          content += `**Sentiment Analysis**:\n`;
          content += `- Positive: ${positive} (${Math.round((positive/total)*100)}%)\n`;
          content += `- Negative: ${negative} (${Math.round((negative/total)*100)}%)\n`;
          content += `- Neutral: ${neutral} (${Math.round((neutral/total)*100)}%)\n\n`;
        }
      }

      // Show articles or sources
      if (params.op === 'get_sources' && result.sources) {
        content += '### Available RSS Sources\n\n';
        for (const [sourceName, sourceInfo] of Object.entries(result.sources)) {
          const info = sourceInfo as { categories: string[] };
          content += `**${sourceName}**\n`;
          content += `- Categories: ${info.categories.join(', ')}\n\n`;
        }

        if (result.categories) {
          content += `### Available Categories\n${result.categories.join(', ')}\n\n`;
        }

      } else if (result.articles && result.articles.length > 0) {
        content += '### Recent News Articles\n\n';

        // Show top 10 articles in detail
        const topArticles = result.articles.slice(0, 10);
        for (const article of topArticles) {
          const publishedDate = new Date(article.published_date).toLocaleString();
          const sentimentEmoji = article.sentiment?.label === 'positive' ? '📈' :
                                article.sentiment?.label === 'negative' ? '📉' : '⚪';

          content += `#### ${sentimentEmoji} ${article.title}\n`;
          content += `**Source**: ${article.source} | **Published**: ${publishedDate}\n`;

          if (article.sentiment) {
            content += `**Sentiment**: ${article.sentiment.label} (${article.sentiment.score})\n`;
          }

          if (article.keywords && article.keywords.length > 0) {
            content += `**Keywords**: ${article.keywords.slice(0, 5).join(', ')}\n`;
          }

          content += `**Summary**: ${article.summary.substring(0, 200)}${article.summary.length > 200 ? '...' : ''}\n`;
          content += `**Link**: ${article.url}\n\n`;

          // Add to display summary
          display += `${article.source}: ${article.title.substring(0, 60)}...\n`;
        }

        if (result.articles.length > 10) {
          content += `*... and ${result.articles.length - 10} more articles*\n\n`;
        }
      }

      content += '*Data aggregated from multiple verified RSS sources with sentiment analysis*\n';

      return {
        llmContent: content,
        returnDisplay: display,
        data: {
          articles: result.articles || [],
          sources_used: result.sources_used || [],
          category_filter: result.category_filter,
          summary: result.summary,
          sentiment_stats: result.sentiment_stats
        }
      };

    } catch (error) {
      return {
        llmContent: `Economic News Tool: Failed to parse result - ${error}`,
        returnDisplay: `Failed to parse result: ${error}`
      };
    }
  }
}