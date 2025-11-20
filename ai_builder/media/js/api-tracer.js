/**
 * API Tracer & Mocker
 *
 * Intercepts and logs network requests (Fetch, XHR) and provides tools
 * for mocking responses. Part of Chameleon's advanced toolset.
 *
 * @package     AI Builder
 * @version     7.0.0
 * @author      CLEO AI
 */

(function () {
    'use strict';

    console.log('[APITracer] 📡 Initializing...');

    class APITracer {
        constructor() {
            this.isActive = false;
            this.requestLog = [];
            this.mocks = {};
            this.originalFetch = window.fetch;
            this.originalXhrSend = XMLHttpRequest.prototype.send;
            this.originalXhrOpen = XMLHttpRequest.prototype.open;
        }

        /**
         * Starts tracing all network requests.
         */
        start() {
            if (this.isActive) {
                console.warn('[APITracer] Already tracing.');
                return;
            }
            this.isActive = true;
            this.patchGlobalFetch();
            this.patchXMLHttpRequest();
            console.log('[APITracer] ▶️ API tracing activated.');
        }

        /**
         * Stops tracing network requests.
         */
        stop() {
            if (!this.isActive) {
                console.warn('[APITracer] Not currently tracing.');
                return;
            }
            this.isActive = false;
            window.fetch = this.originalFetch;
            XMLHttpRequest.prototype.send = this.originalXhrSend;
            XMLHttpRequest.prototype.open = this.originalXhrOpen;
            console.log('[APITracer] ⏹️ API tracing deactivated.');
        }

        /**
         * Clears the request log.
         */
        clearLog() {
            this.requestLog = [];
            console.log('[APITracer] 🗑️ Request log cleared.');
        }

        /**
         * Adds a mock response for a specific URL.
         * @param {string} url - The URL to mock (can be a partial match).
         * @param {object} responseData - The data for the mock response.
         * @param {number} status - The HTTP status code for the mock response.
         */
        addMock(url, responseData, status = 200) {
            this.mocks[url] = { responseData, status };
            console.log(`[APITracer] 🎭 Mock added for URL: ${url}`);
        }

        /**
         * Removes a mock by its URL.
         * @param {string} url - The URL of the mock to remove.
         */
        removeMock(url) {
            if (this.mocks[url]) {
                delete this.mocks[url];
                console.log(`[APITracer] 🎭 Mock removed for URL: ${url}`);
            }
        }

        /**
         * Logs a request and its response.
         * @param {object} logEntry - The entry to add to the log.
         */
        logRequest(logEntry) {
            this.requestLog.push(logEntry);
            // Optional: Limit log size
            if (this.requestLog.length > 100) {
                this.requestLog.shift();
            }
        }

        /**
         * Replaces the global fetch function with our interceptor.
         */
        patchGlobalFetch() {
            const self = this;
            window.fetch = async function (url, options = {}) {
                if (!self.isActive) {
                    return self.originalFetch.call(this, url, options);
                }

                // Check for a mock
                const mock = self.findMock(url);
                if (mock) {
                    console.log(`[APITracer] 🎭 Mocking fetch for: ${url}`);
                    const response = new Response(JSON.stringify(mock.responseData), {
                        status: mock.status,
                        headers: { 'Content-Type': 'application/json' }
                    });
                    self.logRequest({ type: 'fetch', method: options.method || 'GET', url, status: mock.status, mocked: true });
                    return Promise.resolve(response);
                }

                const startTime = Date.now();
                try {
                    const response = await self.originalFetch.call(this, url, options);
                    const duration = Date.now() - startTime;
                    self.logRequest({ type: 'fetch', method: options.method || 'GET', url, status: response.status, duration, mocked: false });
                    return response;
                } catch (error) {
                    const duration = Date.now() - startTime;
                    self.logRequest({ type: 'fetch', method: options.method || 'GET', url, status: 'Error', duration, error: error.message });
                    throw error;
                }
            };
        }

        /**
         * Replaces XMLHttpRequest methods with our interceptors.
         */
        patchXMLHttpRequest() {
            const self = this;
            XMLHttpRequest.prototype.open = function (method, url, ...args) {
                this._requestURL = url;
                this._requestMethod = method;
                self.originalXhrOpen.apply(this, [method, url, ...args]);
            };

            XMLHttpRequest.prototype.send = function (...args) {
                if (!self.isActive) {
                    return self.originalXhrSend.apply(this, args);
                }

                const url = this._requestURL;
                const method = this._requestMethod;

                // Check for a mock
                const mock = self.findMock(url);
                if (mock) {
                    console.log(`[APITracer] 🎭 Mocking XHR for: ${url}`);
                    self.logRequest({ type: 'XHR', method, url, status: mock.status, mocked: true });
                    Object.defineProperty(this, 'readyState', { value: 4 });
                    Object.defineProperty(this, 'status', { value: mock.status });
                    Object.defineProperty(this, 'responseText', { value: JSON.stringify(mock.responseData) });
                    this.dispatchEvent(new ProgressEvent('load'));
                    this.dispatchEvent(new ProgressEvent('readystatechange'));
                    return;
                }

                const startTime = Date.now();
                this.addEventListener('load', () => {
                    const duration = Date.now() - startTime;
                    self.logRequest({ type: 'XHR', method, url, status: this.status, duration, mocked: false });
                });
                this.addEventListener('error', (err) => {
                    const duration = Date.now() - startTime;
                    self.logRequest({ type: 'XHR', method, url, status: 'Error', duration, error: err });
                });

                return self.originalXhrSend.apply(this, args);
            };
        }

        /**
         * Finds a mock that matches the given URL.
         * @param {string} url - The request URL.
         * @returns {object|null} The mock object or null.
         */
        findMock(url) {
            // Exact match
            if (this.mocks[url]) return this.mocks[url];
            // Partial match
            for (const mockUrl in this.mocks) {
                if (url.includes(mockUrl)) {
                    return this.mocks[mockUrl];
                }
            }
            return null;
        }
    }

    // Make it available globally
    window.APITracer = new APITracer();

    console.log('[APITracer] ✅ Tracer initialized. Use `APITracer.start()` to begin tracing.');

})();
