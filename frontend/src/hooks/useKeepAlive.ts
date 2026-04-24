import { useEffect } from 'react';

/**
 * Keep-alive hook for Render free tier
 * Pings the backend /health endpoint every 8 minutes to prevent auto-sleep
 * Render free tier auto-sleeps after 15 minutes of inactivity
 */
export function useKeepAlive() {
    useEffect(() => {
        // Only run in production/deployed environments
        if (import.meta.env.DEV) {
            return;
        }

        const PING_INTERVAL = 8 * 60 * 1000; // 8 minutes in milliseconds

        const pingHealth = async () => {
            try {
                const response = await fetch('/ai-api/api/health', {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('✓ Keep-alive ping successful:', data.timestamp);
                } else {
                    console.warn('Keep-alive ping returned non-200 status:', response.status);
                }
            } catch (err) {
                // Silently fail - this is a background health check
                console.debug('Keep-alive ping failed (will retry):', err);
            }
        };

        // Send first ping after 1 minute
        const initialTimeout = setTimeout(() => {
            pingHealth();
        }, 1 * 60 * 1000);

        // Set up interval for subsequent pings
        const interval = setInterval(() => {
            pingHealth();
        }, PING_INTERVAL);

        // Cleanup
        return () => {
            clearTimeout(initialTimeout);
            clearInterval(interval);
        };
    }, []);
}
