(function () {
    'use strict';

    const reportedErrors = new Set();
    let errorCount = 0;

    const mouseActivity = {
        cursorPos: [],
        clicks: [],
        scrolling: [],
    }

    const keyboardActivity = {
        keydownEvents: [],
        keyupEvents: []
    }

    function getSessionID() {
        let sid = sessionStorage.getItem('_collector_sid');
        if (!sid) {
            sid = `${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;
            sessionStorage.setItem('_collector_sid', sid);
        }
        return sid;
    }

    function getStaticData() {
        let conntype = ''
        if ('connection' in navigator) {
            const conn = navigator.connection;
            conntype = conn.effectiveType;
        }

        return {
            userAgent: navigator.userAgent,
            language: navigator.language,
            cookiesEnabled: navigator.cookieEnabled,
            // TODO: JS, Images & CSS allowed

            // Viewport
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            // Screen
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
        }
    }

    function getPerformanceData() {
        const entries = performance.getEntriesByType('navigation');
         if (!entries.length) return {};

        const n = entries[0];

        return {
            startLoad: Math.round(n.fetchStart),
            endLoad: Math.round(n.loadEventEnd),
            totalLoadTime: Math.round(n.loadEventEnd - n.fetchStart)
        }

    }

    function getActivityData() {
        // Idle time

        // When user entered page

        // When user left page

        // Which page user's on

        return {
            mouseActivity: mouseActivity,
            keyboardActivity: keyboardActivity
        }
    }

    document.addEventListener('mousemove', (event) => {
        mouseActivity[cursorPos].push([event.clientX, event.clientY]);
        if (event.button) mouseActivity[clicks].push(event.button);

    });

    window.addEventListener('scroll', () => {
        mouseActivity[scrolling].push([window.scrollX, window.scrollY])
    });

    document.addEventListener('keydown', (event) => {
        keyboardActivity[keydownEvents].push(event.key)
    });

    document.addEventListener('keyup', () => {
        keyboardActivity[keyupEvents].push(event.key)
    })

    function send(payload) {
        // const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });

        // if (navigator.sendBeacon) {
        // navigator.sendBeacon(ENDPOINT, blob);
        // console.log(`Beacon sent (${payload.type})`);
        // } else {
        // fetch(ENDPOINT, {
        //     method: 'POST',
        //     body: blob,
        //     keepalive: true
        // }).catch((err) => {
        //     console.warn('fetch fallback error:', err.message);
        // });
        // }

        console.log('Payload:', payload);
    }

    function reportError(errorData) {
        if (errorCount >= 10) {
            console.log(`[collector-v6] Error rate limit reached (10), ignoring:`, errorData.message);
            return;
        }

        // Deduplicate by type + message + source + line
        const key = `${errorData.type}:${errorData.message || ''}:${errorData.source || ''}:${errorData.line || ''}`;
        if (reportedErrors.has(key)) {
            console.log('[collector-v6] Duplicate error suppressed:', errorData.message);
            return;
        }
        reportedErrors.add(key);
        errorCount++;

        console.log(`[collector-v6] Error #${errorCount}:`, errorData.type, '-', errorData.message);

        // Send error beacon
        const payload = {
            type: 'error',
            error: errorData,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            session: getSessionID()
        };

        send(payload);
    }

    window.addEventListener('error', (event) => {
        if (event instanceof ErrorEvent) {
            reportError({
            type: 'js-error',
            message: event.message,
            source: event.filename,
            line: event.lineno,
            column: event.colno,
            stack: event.error ? event.error.stack : '',
            url: window.location.href
            });
        } else {
            // Resource load failure (IMG, SCRIPT, LINK)
            const target = event.target;
            if (target && (target.tagName === 'IMG' || target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
            reportError({
                type: 'resource-error',
                tagName: target.tagName,
                src: target.src || target.href || '',
                url: window.location.href
            });
            }
        }
    }, true);

    // Collect after the page is fully loaded
    window.addEventListener('load', () => {
        // Small delay to ensure loadEventEnd is populated
        setTimeout(() => {
            const payload = {
                sessionID: getSessionID(),
                staticData: getStaticData(),
                performanceData: getPerformanceData()
            }
            send(payload)
        }, 0);
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            const payload = {
                sessionID: getSessionID(),
                userActivity: getActivityData()
            }
            send(payload)
        }
    });

})();