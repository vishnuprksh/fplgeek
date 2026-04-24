import { useState, useEffect } from 'react';
import './UpdateButton.css';

interface UpdateButtonProps {
    onUpdateComplete?: () => void;
}

export function UpdateButton({ onUpdateComplete }: UpdateButtonProps) {
    const [isUpdating, setIsUpdating] = useState(false);
    const [progress, setProgress] = useState('');
    const [lastUpdate, setLastUpdate] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Check update status when component mounts
    useEffect(() => {
        checkUpdateStatus();
        // Poll every 10 seconds while not updating
        const interval = setInterval(() => {
            checkUpdateStatus();
        }, 10000);
        return () => clearInterval(interval);
    }, []);

    const checkUpdateStatus = async () => {
        try {
            const response = await fetch('/ai-api/api/update-status');
            const data = await response.json();
            
            setIsUpdating(data.isUpdating || data.status === 'updating');
            if (data.lastUpdateTime) {
                const updateTime = new Date(data.lastUpdateTime);
                const now = new Date();
                const diffMinutes = Math.floor((now.getTime() - updateTime.getTime()) / (1000 * 60));
                
                if (diffMinutes < 1) {
                    setLastUpdate('Just now');
                } else if (diffMinutes < 60) {
                    setLastUpdate(`${diffMinutes}m ago`);
                } else {
                    setLastUpdate(updateTime.toLocaleString());
                }
            }
        } catch (err) {
            console.warn('Failed to check update status:', err);
        }
    };

    const handleUpdate = async () => {
        setIsUpdating(true);
        setProgress('Initializing update...');
        setError(null);

        try {
            // Trigger update
            const response = await fetch('/ai-api/api/update-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to start update');
            }

            const data = await response.json();
            setProgress(data.message || 'Update in progress...');

            // Poll for completion (check every 30 seconds for up to 30 minutes)
            let pollCount = 0;
            const maxPolls = 60; // 30 minutes
            const pollInterval = setInterval(async () => {
                pollCount++;
                
                try {
                    const statusResponse = await fetch('/ai-api/api/update-status');
                    const statusData = await statusResponse.json();

                    if (!statusData.isUpdating && statusData.status === 'idle') {
                        clearInterval(pollInterval);
                        setProgress('');
                        setIsUpdating(false);
                        
                        // Refresh data by reloading page or refetching all data
                        setProgress('Refreshing data...');
                        setTimeout(() => {
                            window.location.reload();
                        }, 1000);
                        
                        if (onUpdateComplete) {
                            onUpdateComplete();
                        }
                    } else {
                        setProgress(`Updating... (${pollCount * 30}s elapsed)`);
                    }
                } catch (err) {
                    console.warn('Error polling update status:', err);
                }

                // Stop polling after max attempts
                if (pollCount >= maxPolls) {
                    clearInterval(pollInterval);
                    setProgress('');
                    setIsUpdating(false);
                    setError('Update taking too long. Check backend logs.');
                }
            }, 30000);
        } catch (err) {
            setIsUpdating(false);
            setProgress('');
            setError(err instanceof Error ? err.message : 'Update failed');
        }
    };

    return (
        <div className="update-button-container">
            <button
                className="update-button"
                onClick={handleUpdate}
                disabled={isUpdating}
                title="Update fixtures, player history, retrain models, and refresh predictions"
            >
                {isUpdating ? (
                    <>
                        <span className="spinner"></span>
                        {progress || 'Updating...'}
                    </>
                ) : (
                    <>
                        <span className="update-icon">↻</span>
                        Update Data
                    </>
                )}
            </button>
            {lastUpdate && !isUpdating && (
                <div className="last-update">Last updated: {lastUpdate}</div>
            )}
            {error && (
                <div className="update-error">{error}</div>
            )}
        </div>
    );
}
