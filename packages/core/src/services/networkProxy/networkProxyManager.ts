/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import { HttpProxy } from './httpProxy.js';
import { SocksProxy } from './socksProxy.js';
import { TrafficLogger } from './trafficLogger.js';
import type {
  NetworkProxyConfig,
  ProxyConnectionRecord,
  ProxyServerAddresses,
  ProxyStatus,
  DomainRule,
  DomainFilterAction,
} from './types.js';
import { DEFAULT_NETWORK_PROXY_CONFIG } from './types.js';

/**
 * Coordinates the HTTP and SOCKS5 proxy servers, traffic logging,
 * and domain check events.
 *
 * Events:
 * - 'connection': Fired for every proxied connection.
 * - 'denied': Fired when a connection is blocked by a rule.
 * - 'domainCheck': Fired when a domain needs user approval.
 *   Signature: (hostname: string, respond: (action: DomainFilterAction) => void)
 * - 'started': Fired when all proxy servers are running.
 * - 'stopped': Fired when all proxy servers have shut down.
 * - 'error': Fired on proxy server errors.
 */
export class NetworkProxyManager extends EventEmitter {
  private httpProxy: HttpProxy | null = null;
  private socksProxy: SocksProxy | null = null;
  private trafficLogger: TrafficLogger;
  private config: NetworkProxyConfig;
  private running = false;

  constructor(config?: Partial<NetworkProxyConfig>) {
    super();
    this.config = { ...DEFAULT_NETWORK_PROXY_CONFIG, ...config };
    this.trafficLogger = new TrafficLogger(
      this.config.maxLogEntries,
      this.config.enableLogging,
    );
  }

  /**
   * Starts both proxy servers and wires up event forwarding.
   */
  async start(): Promise<ProxyServerAddresses> {
    if (this.running) {
      return this.getAddresses();
    }

    const addresses: ProxyServerAddresses = {};

    // Start HTTP proxy
    this.httpProxy = new HttpProxy({
      port: this.config.httpPort,
      rules: this.config.rules,
      defaultAction: this.config.defaultAction,
    });

    this.wireProxyEvents(this.httpProxy);
    const httpPort = await this.httpProxy.start();
    addresses.httpProxy = `127.0.0.1:${httpPort}`;

    // Start SOCKS5 proxy
    this.socksProxy = new SocksProxy({
      port: this.config.socksPort,
      rules: this.config.rules,
      defaultAction: this.config.defaultAction,
    });

    this.wireProxyEvents(this.socksProxy);
    const socksPort = await this.socksProxy.start();
    addresses.socksProxy = `127.0.0.1:${socksPort}`;

    this.running = true;
    this.emit('started', addresses);

    return addresses;
  }

  /**
   * Stops both proxy servers and cleans up.
   */
  async stop(): Promise<void> {
    const shutdowns: Array<Promise<void>> = [];

    if (this.httpProxy) {
      shutdowns.push(this.httpProxy.stop());
    }
    if (this.socksProxy) {
      shutdowns.push(this.socksProxy.stop());
    }

    await Promise.all(shutdowns);

    this.httpProxy = null;
    this.socksProxy = null;
    this.running = false;

    this.emit('stopped');
  }

  getAddresses(): ProxyServerAddresses {
    return {
      httpProxy: this.httpProxy
        ? `127.0.0.1:${this.httpProxy.getPort()}`
        : undefined,
      socksProxy: this.socksProxy
        ? `127.0.0.1:${this.socksProxy.getPort()}`
        : undefined,
    };
  }

  getStatus(): ProxyStatus {
    const httpCount = this.httpProxy?.getConnectionCount() ?? 0;
    const socksCount = this.socksProxy?.getConnectionCount() ?? 0;
    const httpDenied = this.httpProxy?.getDeniedCount() ?? 0;
    const socksDenied = this.socksProxy?.getDeniedCount() ?? 0;

    return {
      running: this.running,
      addresses: this.getAddresses(),
      connectionCount: httpCount + socksCount,
      deniedCount: httpDenied + socksDenied,
    };
  }

  getTrafficLogger(): TrafficLogger {
    return this.trafficLogger;
  }

  getConfig(): Readonly<NetworkProxyConfig> {
    return this.config;
  }

  /**
   * Updates domain filtering rules on both proxies at runtime.
   */
  updateRules(rules: DomainRule[]): void {
    this.config = { ...this.config, rules };
    this.httpProxy?.updateRules(rules);
    this.socksProxy?.updateRules(rules);
  }

  /**
   * Updates the default action for unmatched domains.
   */
  updateDefaultAction(action: DomainFilterAction): void {
    this.config = { ...this.config, defaultAction: action };
    this.httpProxy?.updateDefaultAction(action);
    this.socksProxy?.updateDefaultAction(action);
  }

  /**
   * Records a user's domain decision so future connections aren't prompted again.
   */
  recordSessionDecision(domain: string, action: DomainFilterAction): void {
    this.httpProxy?.recordSessionDecision(domain, action);
    this.socksProxy?.recordSessionDecision(domain, action);
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Returns the environment variables that should be set on child processes
   * so that their network traffic flows through the proxy.
   */
  getProxyEnvironment(): Record<string, string> {
    if (!this.running) {
      return {};
    }

    const env: Record<string, string> = {};
    const addresses = this.getAddresses();

    if (addresses.httpProxy) {
      const httpUrl = `http://${addresses.httpProxy}`;
      env['HTTP_PROXY'] = httpUrl;
      env['http_proxy'] = httpUrl;
      env['HTTPS_PROXY'] = httpUrl;
      env['https_proxy'] = httpUrl;
    }

    if (addresses.socksProxy) {
      env['ALL_PROXY'] = `socks5://${addresses.socksProxy}`;
      env['all_proxy'] = `socks5://${addresses.socksProxy}`;
    }

    return env;
  }

  /**
   * Wires up event forwarding from a proxy server to this manager.
   */
  private wireProxyEvents(proxy: HttpProxy | SocksProxy): void {
    proxy.on('connection', (record: ProxyConnectionRecord) => {
      this.trafficLogger.log(record);
      this.emit('connection', record);
    });

    proxy.on('denied', (record: ProxyConnectionRecord) => {
      this.emit('denied', record);
    });

    proxy.on('domainCheck', (hostname: string, respond: (action: DomainFilterAction) => void) => {
      this.emit('domainCheck', hostname, respond);
    });

    proxy.on('error', (err: Error) => {
      this.emit('error', err);
    });
  }
}
