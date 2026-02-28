(function () {
    'use strict';

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
            startLoad: n.fetchStart,
            endLoad: n.loadEventEnd,
            totalLoadTime: round(n.loadEventEnd - n.fetchStart)
        }

    }

    function getActivityData() {

    }

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

    window.onerror = () => {

    }

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