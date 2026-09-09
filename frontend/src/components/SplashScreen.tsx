import './SplashScreen.css';

interface SplashScreenProps {
    /** Optional status line shown under the spinner (e.g. "Loading database…") */
    message?: string;
}

/**
 * Full-screen splash shown while the app's global data (bootstrap, fixtures,
 * predictions) settles on first load. Uses the app design system tokens.
 */
export function SplashScreen({ message = 'Preparing your analytics…' }: SplashScreenProps) {
    return (
        <div className="splash-screen" role="status" aria-live="polite" aria-label="Loading application">
            <div className="splash-inner">
                <div className="splash-logo">
                    <span className="splash-logo-icon">⚽</span>
                </div>
                <h1 className="splash-title">FPL GEEK</h1>
                <div className="splash-spinner" aria-hidden="true" />
                <p className="splash-message">{message}</p>
            </div>
        </div>
    );
}
