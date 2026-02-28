(function () {
    'use strict';

    const ENDPOINT = 'https://collector.shash.digital/log'

    let IDLE_THRESHOLD = 2000; // 2 seconds
    let idle_timeout;
    let idleStartTime = null;
    const idle_times = []

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

    let user_entry_time;

    function setIdleTimeOut() {
        if (idleStartTime) {
            const idle_duration = Date.now() - idleStartTime
            idle_times.push({
                startTime: idleStartTime,
                endTime: Date.now(),
                duration: idle_duration
            })

            idleStartTime = null;
        }

        clearTimeout(idle_timeout);
        idle_timeout = setTimeout(isIdle, IDLE_THRESHOLD)
    }

    function isIdle() {
        idleStartTime = Date.now()
    }

    function getSessionID() {
        let sid = sessionStorage.getItem('_collector_sid');
        if (!sid) {
            sid = `${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;
            sessionStorage.setItem('_collector_sid', sid);
        }
        return sid;
    }

    function imgTestBeforeSend() {
        const img = new Image();

        img.onload = () => {
            const payload = {
                sessionID: getSessionID(),
                staticData: getStaticData(true),
                performanceData: getPerformanceData()
            }

            send(payload)
        }
        img.onerror = () => {
            const payload = {
                sessionID: getSessionID(),
                staticData: getStaticData(false),
                performanceData: getPerformanceData()
            }

            send(payload)
        }

        img.src = 'assets/test.png'
    }

    function getStaticData(imagestest) {
        let conntype = ''
        if ('connection' in navigator) {
            const conn = navigator.connection;
            conntype = conn.effectiveType;
        }

        const el = document.createElement('div')
        el.className = 'css-test'
        document.body.appendChild(el)
        const style = getComputedStyle(el)
        let csstest = style.display === 'none';

        return {
            userAgent: navigator.userAgent,
            language: navigator.language,
            cookiesEnabled: navigator.cookieEnabled,

            javascriptEnabled: true,
            imagesAllowed: imagestest,
            cssAllowed: csstest,

            // Viewport
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            // Screen
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,

            networkConType: conntype
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
        return {
            mouseActivity: mouseActivity,
            keyboardActivity: keyboardActivity,
            idleTimes: idle_times,
            userEntry: user_entry_time,
            userExit: performance.now(),
            page: window.location.pathname
        }
    }

    document.addEventListener('mousemove', (event) => {
        setIdleTimeOut();
        mouseActivity.cursorPos.push([event.clientX, event.clientY]);
        if (event.button) mouseActivity.clicks.push(event.button);
    });

    window.addEventListener('scroll', () => {
        setIdleTimeOut();
        mouseActivity.scrolling.push([window.scrollX, window.scrollY]);
    });

    document.addEventListener('keydown', (event) => {
        setIdleTimeOut();
        keyboardActivity.keydownEvents.push(event.key)
    });

    document.addEventListener('keyup', (event) => {
        setIdleTimeOut();
        keyboardActivity.keyupEvents.push(event.key)
    })

    function send(payload) {
        const data = JSON.stringify(payload)

        if (navigator.sendBeacon) {
            navigator.sendBeacon(ENDPOINT, data);
            console.log(`Beacon sent (${payload.type})`);
        } else {
        fetch(ENDPOINT, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: data,
        }).catch((err) => {
            console.warn('fetch fallback error:', err.message);
        });
        }

        console.log('Payload:', payload);
    }

    function reportError(errorData) {
        if (errorCount >= 10) {
            console.log(`Error rate limit reached (10), ignoring:`, errorData.message);
            return;
        }

        // Deduplicate by type + message + source + line
        const key = `${errorData.type}:${errorData.message || ''}:${errorData.source || ''}:${errorData.line || ''}`;
        if (reportedErrors.has(key)) {
            console.log('Duplicate error suppressed:', errorData.message);
            return;
        }
        reportedErrors.add(key);
        errorCount++;

        console.log(`Error #${errorCount}:`, errorData.type, '-', errorData.message);

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
            user_entry_time = performance.now()
            setIdleTimeOut();
            // Image onload/onerror that sends payload
            imgTestBeforeSend();
            // const payload = {
            //     sessionID: getSessionID(),
            //     staticData: sdata,
            //     performanceData: getPerformanceData()
            // }
            // send(payload)
        }, 0);
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            const payload = {
                sessionID: getSessionID(),
                activity: getActivityData()
            }
            send(payload)
        }
    });

})();